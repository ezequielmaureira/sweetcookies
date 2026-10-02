import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AuthService } from "./auth.ts";
import type { VoucherRepository, VoucherTransition } from "./voucher-repository.ts";
import { isValidPublicId, normalizeVoucherCode, parseVoucherListQuery, toAdminVoucher, toPublicVoucher, validateVoucherInput, type VoucherRecord } from "./vouchers.ts";

type Variables = { userId: string };
type AppContext = Context<{ Variables: Variables }>;

type Deps = {
  vouchers: VoucherRepository;
  auth: AuthService;
  log: (message: string) => void;
};

const notFound = (c: Context) => c.json({ error: "not_found" }, 404);

/**
 * Módulo de vouchers (independiente del resto de la API).
 * Se registra DESPUÉS del middleware de /api/admin/*: todas las rutas admin
 * ya llegan autenticadas (401) y autorizadas por ADMIN_EMAILS (403).
 */
export function registerVoucherRoutes(app: Hono<{ Variables: Variables }>, { vouchers, auth, log }: Deps) {
  // ---------- Público: lo que abre el QR ----------
  // Siempre el estado REAL de la base (sin caché): un voucher recién canjeado
  // tiene que verse canjeado en el próximo escaneo.
  app.get("/api/public/vouchers/:publicId", async (c) => {
    c.header("Cache-Control", "no-store");
    const publicId = c.req.param("publicId") ?? "";
    if (!isValidPublicId(publicId)) return notFound(c);
    const voucher = await vouchers.getByPublicId(publicId);
    return voucher ? c.json(toPublicVoucher(voucher)) : notFound(c);
  });

  // ---------- Admin ----------
  app.get("/api/admin/vouchers", async (c) => {
    const result = await vouchers.list(parseVoucherListQuery(new URL(c.req.url).searchParams));
    const now = new Date();
    return c.json({ ...result, vouchers: result.vouchers.map((v) => toAdminVoucher(v, now)) });
  });

  app.post("/api/admin/vouchers", bodyLimit({ maxSize: 2 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) }), async (c: AppContext) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const result = validateVoucherInput(body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const created = await vouchers.create(result.data, c.get("userId"));
    log(`[admin] voucher ${created.code} (caja ${created.cookieQuantity}) created by ${c.get("userId")}`);
    return c.json(toAdminVoucher(created), 201);
  });

  // Detalle: incluye el email de quién canjeó/anuló (se consulta a Clerk, nunca al cliente).
  const detail = async (voucher: VoucherRecord) => {
    const describe = (userId: string | null) => (userId && auth.describeUser ? auth.describeUser(userId) : Promise.resolve(null));
    const [redeemedBy, cancelledBy] = await Promise.all([describe(voucher.redeemedByUserId), describe(voucher.cancelledByUserId)]);
    return { ...toAdminVoucher(voucher), redeemedBy, cancelledBy };
  };

  // Búsqueda manual por código (respaldo del escáner). Solo admin: no hay versión pública.
  app.get("/api/admin/vouchers/by-code/:code", async (c) => {
    const code = normalizeVoucherCode(c.req.param("code") ?? "");
    if (!code) return notFound(c);
    const voucher = await vouchers.getByCode(code);
    return voucher ? c.json(await detail(voucher)) : notFound(c);
  });

  app.get("/api/admin/vouchers/:publicId", async (c) => {
    const publicId = c.req.param("publicId") ?? "";
    if (!isValidPublicId(publicId)) return notFound(c);
    const voucher = await vouchers.getByPublicId(publicId);
    return voucher ? c.json(await detail(voucher)) : notFound(c);
  });

  /**
   * 200 = canje/anulación hecha · 409 = no se pudo (el body trae el estado
   * actual: ya canjeado, vencido, anulado) · 404 = no existe.
   */
  const transitionResponse = (c: AppContext, result: VoucherTransition) => {
    if (!result.voucher) return notFound(c);
    const voucher = toAdminVoucher(result.voucher);
    return result.ok ? c.json({ ok: true, voucher }) : c.json({ ok: false, error: "voucher_not_active", voucher }, 409);
  };

  app.post("/api/admin/vouchers/:publicId/redeem", async (c: AppContext) => {
    const publicId = c.req.param("publicId") ?? "";
    if (!isValidPublicId(publicId)) return notFound(c);
    const result = await vouchers.redeem(publicId, c.get("userId"));
    log(`[admin] voucher ${result.voucher?.code ?? publicId} redeem ${result.ok ? "ok" : "rejected"} by ${c.get("userId")}`);
    return transitionResponse(c, result);
  });

  app.post("/api/admin/vouchers/:publicId/cancel", async (c: AppContext) => {
    const publicId = c.req.param("publicId") ?? "";
    if (!isValidPublicId(publicId)) return notFound(c);
    const result = await vouchers.cancel(publicId, c.get("userId"));
    log(`[admin] voucher ${result.voucher?.code ?? publicId} cancel ${result.ok ? "ok" : "rejected"} by ${c.get("userId")}`);
    return transitionResponse(c, result);
  });

  // Eliminación definitiva en CUALQUIER estado (activo, canjeado, anulado o vencido).
  // Después, el QR y la URL responden como voucher inexistente (404).
  app.delete("/api/admin/vouchers/:publicId", async (c: AppContext) => {
    const publicId = c.req.param("publicId") ?? "";
    if (!isValidPublicId(publicId)) return notFound(c);
    const deleted = await vouchers.remove(publicId);
    if (!deleted) return notFound(c);
    log(`[admin] voucher ${deleted.code} (${deleted.status}) deleted by ${c.get("userId")}`);
    return c.body(null, 204);
  });
}
