import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import type { AuthService } from "./auth.ts";
import type { SettingsRepository } from "./repository.ts";
import { validateSettingsInput, type PublicSettings } from "./settings.ts";

type Deps = {
  repo: SettingsRepository;
  auth: AuthService;
  allowedOrigins: string[];
  /** Logger sin datos sensibles (nunca tokens ni URLs de DB). */
  log?: (message: string) => void;
};

type Variables = { userId: string };

export function createApp({ repo, auth, allowedOrigins, log = console.error }: Deps) {
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

  // ---------- Público ----------
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

  // ---------- Admin ----------
  // CORS restringido a los orígenes configurados (sin "*").
  app.use(
    "/api/admin/*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "PUT", "OPTIONS"],
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

  app.get("/api/admin/settings", async (c) => c.json(await repo.get()));

  app.put("/api/admin/settings", bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) }), async (c: Context<{ Variables: Variables }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const result = validateSettingsInput(body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const saved = await repo.update(result.data, c.get("userId"));
    log(`[admin] settings updated by ${c.get("userId")}`);
    return c.json(saved);
  });

  return app;
}
