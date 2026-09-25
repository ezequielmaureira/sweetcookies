import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "./app.ts";
import type { AuthService } from "./auth.ts";
import type { SettingsRepository } from "./repository.ts";
import { DEFAULT_SETTINGS, type AdminSettings } from "./settings.ts";

const ORIGIN = "https://sweetcookies-seven.vercel.app";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de respuesta en tests
const json = async (res: Response): Promise<Record<string, any>> => (await res.json()) as Record<string, any>;

function setup() {
  let state: AdminSettings = { ...DEFAULT_SETTINGS, instagramHandle: "@sweet.cookies.rio4", updatedAt: null };
  const updates: string[] = [];
  const repo: SettingsRepository = {
    get: async () => state,
    update: async (data, by) => {
      updates.push(by);
      state = { ...data, updatedAt: new Date(0).toISOString() };
      return state;
    },
    ping: async () => {},
  };
  // Tokens falsos: "admin-token" → admin, "user-token" → usuario sin rol.
  const auth: AuthService = {
    authenticate: async (req) => {
      const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
      if (token === "admin-token") return { userId: "user_admin" };
      if (token === "user-token") return { userId: "user_plain" };
      return null;
    },
    isAdmin: async (userId) => userId === "user_admin",
  };
  const logs: string[] = [];
  const app = createApp({ repo, auth, allowedOrigins: [ORIGIN], log: (m) => logs.push(m) });
  return { app, updates, logs };
}

const put = (token: string | null, body: unknown) =>
  new Request("http://api/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: ORIGIN },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("API", () => {
  it("GET /health y /health/db", async () => {
    const { app } = setup();
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { status: "ok" });
    assert.equal((await app.request("/health/db")).status, 200);
  });

  it("GET /api/public/settings devuelve solo los campos públicos", async () => {
    const res = await setup().app.request("/api/public/settings", { headers: { Origin: "https://otro.com" } });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(await json(res)).sort(), ["instagramHandle", "whatsappNumber", "whatsappOrdersEnabled"]);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });

  it("admin sin token → 401", async () => {
    const res = await setup().app.request("/api/admin/settings");
    assert.equal(res.status, 401);
  });

  it("admin con usuario sin rol → 403", async () => {
    const res = await setup().app.request("/api/admin/settings", { headers: { Authorization: "Bearer user-token" } });
    assert.equal(res.status, 403);
    const put403 = await setup().app.request(put("user-token", { whatsappNumber: "5493584123456", whatsappOrdersEnabled: true }));
    assert.equal(put403.status, 403);
  });

  it("admin → 200, guarda normalizado y audita", async () => {
    const { app, updates } = setup();
    const res = await app.request(put("admin-token", { whatsappNumber: "+54 9 358 412-3456", instagramHandle: "@sweet.cookies.rio4", whatsappOrdersEnabled: false }));
    assert.equal(res.status, 200);
    const saved = await json(res);
    assert.equal(saved.whatsappNumber, "5493584123456");
    assert.equal(saved.whatsappOrdersEnabled, false);
    assert.deepEqual(updates, ["user_admin"]);
    const pub = await json(await app.request("/api/public/settings"));
    assert.equal(pub.whatsappNumber, "5493584123456");
    assert.equal(pub.whatsappOrdersEnabled, false);
  });

  it("validación → 422 con errores por campo; JSON roto → 400", async () => {
    const { app } = setup();
    const res = await app.request(put("admin-token", { whatsappNumber: "12", whatsappOrdersEnabled: true }));
    assert.equal(res.status, 422);
    assert.ok((await json(res)).fields.whatsappNumber);
    assert.equal((await app.request(put("admin-token", "{roto"))).status, 400);
  });

  it("CORS admin: solo orígenes permitidos, nunca *", async () => {
    const { app } = setup();
    const ok = await app.request("/api/admin/settings", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type" },
    });
    assert.equal(ok.headers.get("access-control-allow-origin"), ORIGIN);
    const bad = await app.request("/api/admin/settings", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "PUT" },
    });
    assert.notEqual(bad.headers.get("access-control-allow-origin"), "https://evil.example");
    assert.notEqual(bad.headers.get("access-control-allow-origin"), "*");
  });

  it("errores internos no filtran detalles", async () => {
    const { app, logs } = setup();
    const failing = createApp({
      repo: { get: async () => { throw new Error("postgres://user:secret@host/db"); }, update: async () => { throw new Error(); }, ping: async () => {} },
      auth: { authenticate: async () => null, isAdmin: async () => false },
      allowedOrigins: [ORIGIN],
      log: (m) => logs.push(m),
    });
    const res = await failing.request("/api/public/settings");
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes("secret"));
    assert.ok(logs.every((l) => !l.includes("secret")));
    void app;
  });
});
