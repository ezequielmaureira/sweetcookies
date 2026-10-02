import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "./app.ts";
import type { AuthService } from "./auth.ts";
import type { VoucherRepository, VoucherTransition } from "./voucher-repository.ts";
import {
  displayStatus,
  endOfDayInArgentina,
  generatePublicId,
  generateVoucherCode,
  normalizeVoucherCode,
  parseVoucherListQuery,
  todayInArgentina,
  validateVoucherInput,
  voucherWhere,
  type VoucherRecord,
} from "./vouchers.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de respuesta en tests
const json = async (res: Response): Promise<Record<string, any>> => (await res.json()) as Record<string, any>;

const NOW = new Date("2026-10-01T15:00:00Z"); // 12:00 en Argentina

describe("vouchers: lógica", () => {
  it("códigos y publicId con formato fijo y distintos entre sí", () => {
    const codes = new Set(Array.from({ length: 2000 }, generateVoucherCode));
    const ids = new Set(Array.from({ length: 2000 }, generatePublicId));
    assert.equal(codes.size, 2000);
    assert.equal(ids.size, 2000);
    for (const code of codes) assert.match(code, /^SC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    for (const id of ids) assert.match(id, /^[0-9a-zA-Z]{16}$/);
  });

  it("código manual: con o sin SC-, mayúsculas o minúsculas → mismo código", () => {
    for (const raw of ["SC-8K4P2M", "8K4P2M", "sc-8k4p2m", " sc 8k4p2m ", "SC8K4P2M"]) assert.equal(normalizeVoucherCode(raw), "SC-8K4P2M", raw);
    for (const raw of ["", "SC-", "8K4P2", "8K4P2MX", "SC-8K4P2O", "../../x", "SC-8K4P2M-1"]) assert.equal(normalizeVoucherCode(raw), null, raw);
  });

  it("válido hasta = fin del día en Argentina (incluye todo el día)", () => {
    assert.equal(endOfDayInArgentina("2026-10-15")?.toISOString(), "2026-10-16T02:59:59.999Z");
    assert.equal(endOfDayInArgentina("2026-02-31"), null);
    assert.equal(endOfDayInArgentina("15/10/2026"), null);
    assert.equal(todayInArgentina(new Date("2026-10-02T02:00:00Z")), "2026-10-01");
  });

  it("valida tipo (4 o 6) y fecha (hoy en adelante, hasta 2 años)", () => {
    const ok = validateVoucherInput({ cookieQuantity: 6, validUntil: "2026-10-15" }, NOW);
    assert.ok(ok.ok);
    assert.equal(ok.ok && ok.data.cookieQuantity, 6);
    assert.ok(validateVoucherInput({ cookieQuantity: 4, validUntil: "2026-10-01" }, NOW).ok, "hoy es válido");

    const bad = validateVoucherInput({ cookieQuantity: 5, validUntil: "2026-09-30" }, NOW);
    assert.ok(!bad.ok);
    assert.ok(!bad.ok && bad.errors.cookieQuantity && bad.errors.validUntil);
    assert.ok(!validateVoucherInput({ cookieQuantity: 6, validUntil: "2030-01-01" }, NOW).ok);
    assert.ok(!validateVoucherInput({ cookieQuantity: "6", validUntil: "2026-10-15" }, NOW).ok);
    assert.ok(!validateVoucherInput(null, NOW).ok);
  });

  it("VENCIDO se calcula: ACTIVE con expiresAt pasado", () => {
    const past = new Date(NOW.getTime() - 1);
    const future = new Date(NOW.getTime() + 1);
    assert.equal(displayStatus({ status: "ACTIVE", expiresAt: past }, NOW), "EXPIRED");
    assert.equal(displayStatus({ status: "ACTIVE", expiresAt: future }, NOW), "ACTIVE");
    assert.equal(displayStatus({ status: "REDEEMED", expiresAt: past }, NOW), "REDEEMED");
    assert.equal(displayStatus({ status: "CANCELLED", expiresAt: future }, NOW), "CANCELLED");
  });

  it("filtros del historial", () => {
    assert.equal(parseVoucherListQuery(new URLSearchParams("status=expired")).filter, "expired");
    assert.equal(parseVoucherListQuery(new URLSearchParams("status=hack")).filter, "all");
    assert.deepEqual(voucherWhere("active", NOW), { status: "ACTIVE", expiresAt: { gte: NOW } });
    assert.deepEqual(voucherWhere("expired", NOW), { status: "ACTIVE", expiresAt: { lt: NOW } });
    assert.deepEqual(voucherWhere("all", NOW), {});
  });
});

/** Repositorio en memoria con la MISMA regla atómica que Prisma (UPDATE condicional). */
function memoryVouchers() {
  const rows: VoucherRecord[] = [];
  const conditionalUpdate = async (publicId: string, matches: (v: VoucherRecord) => boolean, apply: (v: VoucherRecord) => void): Promise<VoucherTransition> => {
    const v = rows.find((r) => r.publicId === publicId);
    if (!v) return { ok: false, voucher: null };
    if (!matches(v)) return { ok: false, voucher: { ...v } };
    apply(v);
    return { ok: true, voucher: { ...v } };
  };
  const repo: VoucherRepository = {
    create: async (input, createdByUserId) => {
      const row: VoucherRecord = {
        id: `v${rows.length + 1}`,
        publicId: generatePublicId(),
        code: generateVoucherCode(),
        cookieQuantity: input.cookieQuantity,
        expiresAt: input.expiresAt,
        status: "ACTIVE",
        createdAt: new Date(),
        createdByUserId,
        redeemedAt: null,
        redeemedByUserId: null,
        cancelledAt: null,
        cancelledByUserId: null,
      };
      rows.push(row);
      return { ...row };
    },
    list: async () => ({ vouchers: [...rows].reverse(), total: rows.length, page: 1, pageSize: 30, totalPages: 1 }),
    getByPublicId: async (publicId) => rows.find((r) => r.publicId === publicId) ?? null,
    getByCode: async (code) => rows.find((r) => r.code === code) ?? null,
    redeem: (publicId, userId) =>
      conditionalUpdate(
        publicId,
        (v) => v.status === "ACTIVE" && v.expiresAt.getTime() >= Date.now(),
        (v) => Object.assign(v, { status: "REDEEMED", redeemedAt: new Date(), redeemedByUserId: userId }),
      ),
    cancel: (publicId, userId) =>
      conditionalUpdate(
        publicId,
        (v) => v.status === "ACTIVE",
        (v) => Object.assign(v, { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: userId }),
      ),
  };
  return { repo, rows };
}

function setup() {
  const auth: AuthService = {
    authenticate: async (req) => {
      const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
      if (token === "admin-token") return { userId: "user_admin" };
      if (token === "user-token") return { userId: "user_plain" };
      return null;
    },
    isAdmin: async (userId) => userId === "user_admin",
    describeUser: async (userId) => (userId === "user_admin" ? "admin@example.com" : null),
  };
  const memory = memoryVouchers();
  const unused = async () => {
    throw new Error("no usado");
  };
  const app = createApp({
    repo: { get: unused, update: unused, updateOrders: unused, ping: unused },
    products: { listPublic: unused, listAll: unused, get: unused, create: unused, update: unused, remove: unused, duplicate: unused },
    orders: { create: unused, list: unused, get: unused },
    images: { save: unused, get: unused },
    vouchers: memory.repo,
    auth,
    allowedOrigins: ["http://localhost:3000"],
    log: () => {},
  });
  return { app, memory };
}

const admin = (path: string, init: RequestInit = {}, token = "admin-token") =>
  new Request(`http://api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });

const inDays = (days: number) => todayInArgentina(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

describe("vouchers: API", () => {
  it("crear exige admin (401 sin sesión, 403 sin permiso)", async () => {
    const { app } = setup();
    const body = JSON.stringify({ cookieQuantity: 6, validUntil: inDays(10) });
    assert.equal((await app.request(new Request("http://api/api/admin/vouchers", { method: "POST", body }))).status, 401);
    assert.equal((await app.request(admin("/api/admin/vouchers", { method: "POST", body }, "user-token"))).status, 403);
  });

  it("dos cajas de 6 con la misma fecha → códigos y publicId distintos", async () => {
    const { app } = setup();
    const body = JSON.stringify({ cookieQuantity: 6, validUntil: inDays(14) });
    const a = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body })));
    const b = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body })));
    assert.equal(a.status, "ACTIVE");
    assert.equal(a.cookieQuantity, 6);
    assert.notEqual(a.code, b.code);
    assert.notEqual(a.publicId, b.publicId);
    assert.equal(a.expiresAt, b.expiresAt);
  });

  it("422 con datos inválidos", async () => {
    const { app } = setup();
    const res = await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 12, validUntil: "ayer" }) }));
    assert.equal(res.status, 422);
    const body = await json(res);
    assert.ok(body.fields.cookieQuantity && body.fields.validUntil);
  });

  it("canje: el primero gana, el segundo (y los simultáneos) reciben 409 YA CANJEADO", async () => {
    const { app } = setup();
    const created = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 4, validUntil: inDays(5) }) })));
    const redeem = () => app.request(admin(`/api/admin/vouchers/${created.publicId}/redeem`, { method: "POST" }));

    const results = await Promise.all([redeem(), redeem(), redeem()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);

    const again = await redeem();
    assert.equal(again.status, 409);
    assert.equal((await json(again)).voucher.status, "REDEEMED");

    const pub = await json(await app.request(`/api/public/vouchers/${created.publicId}`));
    assert.equal(pub.status, "REDEEMED");
    assert.ok(pub.redeemedAt);
    assert.equal(pub.redeemedByUserId, undefined, "el QR público no expone usuarios");

    const detail = await json(await app.request(admin(`/api/admin/vouchers/${created.publicId}`)));
    assert.equal(detail.redeemedBy, "admin@example.com");
  });

  it("canjear exige admin: el QR público solo lee", async () => {
    const { app } = setup();
    const created = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 6, validUntil: inDays(5) }) })));
    const anon = await app.request(new Request(`http://api/api/admin/vouchers/${created.publicId}/redeem`, { method: "POST" }));
    assert.equal(anon.status, 401);
    const pub = await app.request(`/api/public/vouchers/${created.publicId}`);
    assert.equal(pub.headers.get("cache-control"), "no-store");
    assert.equal((await json(pub)).status, "ACTIVE");
  });

  it("vencido: se muestra VENCIDO y no se puede canjear", async () => {
    const { app, memory } = setup();
    const created = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 6, validUntil: inDays(1) }) })));
    memory.rows[0].expiresAt = new Date(Date.now() - 60_000); // simula el vencimiento
    assert.equal((await json(await app.request(`/api/public/vouchers/${created.publicId}`))).status, "EXPIRED");
    const res = await app.request(admin(`/api/admin/vouchers/${created.publicId}/redeem`, { method: "POST" }));
    assert.equal(res.status, 409);
    assert.equal((await json(res)).voucher.status, "EXPIRED");
  });

  it("anular: queda ANULADO, no se canjea ni se anula de nuevo", async () => {
    const { app } = setup();
    const created = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 6, validUntil: inDays(3) }) })));
    const cancel = await app.request(admin(`/api/admin/vouchers/${created.publicId}/cancel`, { method: "POST" }));
    assert.equal(cancel.status, 200);
    assert.equal((await json(cancel)).voucher.status, "CANCELLED");
    assert.equal((await app.request(admin(`/api/admin/vouchers/${created.publicId}/cancel`, { method: "POST" }))).status, 409);
    const redeem = await app.request(admin(`/api/admin/vouchers/${created.publicId}/redeem`, { method: "POST" }));
    assert.equal(redeem.status, 409);
    assert.equal((await json(redeem)).voucher.status, "CANCELLED");
    assert.equal((await json(await app.request(`/api/public/vouchers/${created.publicId}`))).status, "CANCELLED");
  });

  it("publicId inexistente o mal formado → 404", async () => {
    const { app } = setup();
    assert.equal((await app.request("/api/public/vouchers/abcdefghijklmnop")).status, 404);
    assert.equal((await app.request("/api/public/vouchers/..%2F..%2Fetc")).status, 404);
    assert.equal((await app.request(admin("/api/admin/vouchers/abcdefghijklmnop/redeem", { method: "POST" }))).status, 404);
  });

  it("búsqueda por código: solo admin, con o sin SC-, mismo voucher y se puede canjear", async () => {
    const { app } = setup();
    const created = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 4, validUntil: inDays(7) }) })));
    const bare = created.code.slice(3);

    assert.equal((await app.request(new Request(`http://api/api/admin/vouchers/by-code/${created.code}`))).status, 401);
    assert.equal((await app.request(admin(`/api/admin/vouchers/by-code/${created.code}`, {}, "user-token"))).status, 403);
    assert.equal((await app.request(`/api/public/vouchers/by-code/${created.code}`)).status, 404, "no hay búsqueda pública por código");

    for (const typed of [created.code, bare, created.code.toLowerCase(), bare.toLowerCase()]) {
      const res = await app.request(admin(`/api/admin/vouchers/by-code/${encodeURIComponent(typed)}`));
      assert.equal(res.status, 200, typed);
      const found = await json(res);
      assert.equal(found.publicId, created.publicId);
      assert.equal(found.status, "ACTIVE");
    }

    // Mismo flujo que el QR: con el publicId encontrado se canjea (atómico, una sola vez).
    assert.equal((await app.request(admin(`/api/admin/vouchers/${created.publicId}/redeem`, { method: "POST" }))).status, 200);
    const after = await json(await app.request(admin(`/api/admin/vouchers/by-code/${bare}`)));
    assert.equal(after.status, "REDEEMED");
    assert.ok(after.redeemedAt);
    assert.equal(after.redeemedBy, "admin@example.com");
    assert.equal((await app.request(admin(`/api/admin/vouchers/${created.publicId}/redeem`, { method: "POST" }))).status, 409);
  });

  it("búsqueda por código: inexistente o mal escrito → 404; estados vencido y anulado", async () => {
    const { app, memory } = setup();
    assert.equal((await app.request(admin("/api/admin/vouchers/by-code/SC-ZZZZZZ"))).status, 404);
    assert.equal((await app.request(admin("/api/admin/vouchers/by-code/hola"))).status, 404);
    assert.equal((await app.request(admin("/api/admin/vouchers/by-code/%25"))).status, 404);

    const expired = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 6, validUntil: inDays(2) }) })));
    memory.rows[0].expiresAt = new Date(Date.now() - 1000);
    assert.equal((await json(await app.request(admin(`/api/admin/vouchers/by-code/${expired.code}`)))).status, "EXPIRED");

    const cancelled = await json(await app.request(admin("/api/admin/vouchers", { method: "POST", body: JSON.stringify({ cookieQuantity: 6, validUntil: inDays(2) }) })));
    await app.request(admin(`/api/admin/vouchers/${cancelled.publicId}/cancel`, { method: "POST" }));
    assert.equal((await json(await app.request(admin(`/api/admin/vouchers/by-code/${cancelled.code}`)))).status, "CANCELLED");
  });
});
