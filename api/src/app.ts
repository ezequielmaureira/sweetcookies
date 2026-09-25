import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import type { AuthService } from "./auth.ts";
import type { ProductRepository } from "./catalog-repository.ts";
import type { OrderRepository } from "./order-repository.ts";
import { OrderError, parseOrderListQuery, validateOrderRequest } from "./orders.ts";
import { toAdminProduct, toPublicProduct, validateProductInput } from "./products.ts";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";
import type { SettingsRepository } from "./repository.ts";
import { validateSettingsInput, type PublicSettings } from "./settings.ts";

type Deps = {
  repo: SettingsRepository;
  products: ProductRepository;
  orders: OrderRepository;
  auth: AuthService;
  allowedOrigins: string[];
  /** Límite de pedidos por IP (por defecto 8 cada 10 minutos). */
  orderLimiter?: RateLimiter;
  /** Logger sin datos sensibles (nunca tokens ni URLs de DB). */
  log?: (message: string) => void;
};

type Variables = { userId: string };
type AppContext = Context<{ Variables: Variables }>;

const tooLarge = (c: Context) => c.json({ error: "payload_too_large" }, 413);

async function readJson(c: Context): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

/** IP del cliente detrás del proxy de Fly (o la cabecera estándar). */
const clientIp = (c: Context) =>
  c.req.header("fly-client-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export function createApp({
  repo,
  products,
  orders,
  auth,
  allowedOrigins,
  orderLimiter = createRateLimiter({ limit: 8, windowMs: 10 * 60 * 1000 }),
  log = console.error,
}: Deps) {
  const app = new Hono<{ Variables: Variables }>();

  app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));

  // Errores genéricos: nunca se devuelven detalles internos.
  app.onError((err, c) => {
    log(`[error] ${c.req.method} ${c.req.path}: ${err instanceof Error ? err.name : "Error"}`);
    return c.json({ error: "internal_error" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  // Liviano: no toca la base (los health checks de Fly no deben despertar Neon).
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Verificación profunda (base de datos), para chequeos manuales.
  app.get("/health/db", async (c) => {
    try {
      await repo.ping();
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "degraded" }, 503);
    }
  });

  // ---------- Público (solo lectura) ----------
  // Datos no sensibles: se permite cualquier origen (solo GET, sin credenciales).
  app.use("/api/public/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

  app.get("/api/public/settings", async (c) => {
    const settings = await repo.get();
    const body: PublicSettings = {
      whatsappNumber: settings.whatsappNumber,
      instagramHandle: settings.instagramHandle,
      whatsappOrdersEnabled: settings.whatsappOrdersEnabled,
    };
    c.header("Cache-Control", "public, max-age=15, s-maxage=15, stale-while-revalidate=60");
    return c.json(body);
  });

  // Catálogo del comprador: mismos productos que el admin, sin costo ni ganancia.
  app.get("/api/public/products", async (c) => {
    const list = await products.listPublic();
    c.header("Cache-Control", "public, max-age=10, s-maxage=10, stale-while-revalidate=30");
    return c.json({ products: list.map(toPublicProduct) });
  });

  // ---------- Pedidos (comprador) ----------
  // Escritura pública: solo desde los orígenes de la web (CORS) y con límite por IP.
  app.use(
    "/api/orders",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );

  app.post("/api/orders", bodyLimit({ maxSize: 16 * 1024, onError: tooLarge }), async (c) => {
    c.header("Cache-Control", "no-store");
    if (!orderLimiter.allow(clientIp(c))) return c.json({ error: "too_many_requests" }, 429);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateOrderRequest(parsed.body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);

    try {
      const created = await orders.create(result.data);
      log(`[order] #${created.receipt.number} creado (${created.receipt.itemCount} u.)`);
      return c.json({ order: created.receipt, whatsappNumber: created.whatsappNumber }, 201);
    } catch (error) {
      if (!(error instanceof OrderError)) throw error;
      if (error.code === "invalid_items") return c.json({ error: "items_unavailable", problems: error.problems }, 409);
      return c.json({ error: error.code }, 409);
    }
  });

  // ---------- Admin ----------
  // CORS restringido a los orígenes configurados (sin "*").
  app.use(
    "/api/admin/*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );

  // Autenticación (401) + autorización (403) en el servidor para todo /api/admin.
  app.use("/api/admin/*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    c.header("Cache-Control", "no-store");
    const result = await auth.authenticate(c.req.raw);
    if (!result) return c.json({ error: "unauthorized" }, 401);
    if (!(await auth.isAdmin(result.userId))) return c.json({ error: "forbidden" }, 403);
    c.set("userId", result.userId);
    await next();
  });

  // Configuración
  app.get("/api/admin/settings", async (c) => c.json(await repo.get()));

  app.put("/api/admin/settings", bodyLimit({ maxSize: 4 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateSettingsInput(parsed.body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const saved = await repo.update(result.data, c.get("userId"));
    log(`[admin] settings updated by ${c.get("userId")}`);
    return c.json(saved);
  });

  // Productos
  app.get("/api/admin/products", async (c) => c.json({ products: (await products.listAll()).map(toAdminProduct) }));

  app.post("/api/admin/products", bodyLimit({ maxSize: 8 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateProductInput(parsed.body, false);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const created = await products.create(result.data);
    log(`[admin] product ${created.id} created by ${c.get("userId")}`);
    return c.json(toAdminProduct(created), 201);
  });

  // Edición parcial: también activar/pausar ({status}), destacar ({featured}), stock, precio, costo, imagen.
  app.patch("/api/admin/products/:id", bodyLimit({ maxSize: 8 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateProductInput(parsed.body, true);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const updated = await products.update((c.req.param("id") ?? ""), result.data);
    if (!updated) return c.json({ error: "not_found" }, 404);
    log(`[admin] product ${updated.id} updated by ${c.get("userId")}`);
    return c.json(toAdminProduct(updated));
  });

  app.post("/api/admin/products/:id/duplicate", async (c: AppContext) => {
    const copy = await products.duplicate((c.req.param("id") ?? ""));
    if (!copy) return c.json({ error: "not_found" }, 404);
    log(`[admin] product ${copy.id} duplicated by ${c.get("userId")}`);
    return c.json(toAdminProduct(copy), 201);
  });

  app.delete("/api/admin/products/:id", async (c: AppContext) => {
    const removed = await products.remove((c.req.param("id") ?? ""));
    if (!removed) return c.json({ error: "not_found" }, 404);
    log(`[admin] product ${(c.req.param("id") ?? "")} deleted by ${c.get("userId")}`);
    return c.body(null, 204);
  });

  // Pedidos: filtros, orden y resumen se resuelven en la base.
  app.get("/api/admin/orders", async (c) => c.json(await orders.list(parseOrderListQuery(new URL(c.req.url).searchParams))));

  app.get("/api/admin/orders/:id", async (c) => {
    const order = await orders.get((c.req.param("id") ?? ""));
    return order ? c.json(order) : c.json({ error: "not_found" }, 404);
  });

  return app;
}
