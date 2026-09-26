import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "./app.ts";
import type { AuthService } from "./auth.ts";
import type { ProductRepository } from "./catalog-repository.ts";
import { PNG_1x1, product } from "./catalog.test.ts";
import type { ImageRepository } from "./image-repository.ts";
import type { OrderRepository } from "./order-repository.ts";
import { OrderError, priceOrder, toReceipt } from "./orders.ts";
import { compareCatalogOrder, isPurchasable, type ProductRecord } from "./products.ts";
import { createRateLimiter } from "./rate-limit.ts";
import type { SettingsRepository } from "./repository.ts";
import { DEFAULT_SETTINGS, type AdminSettings } from "./settings.ts";

const ORIGIN = "https://sweetcookies-seven.vercel.app";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de respuesta en tests
const json = async (res: Response): Promise<Record<string, any>> => (await res.json()) as Record<string, any>;

/** Repositorios en memoria con las mismas reglas que Prisma (pedido todo o nada). */
function memoryRepos(getSettings: () => AdminSettings) {
  let items: ProductRecord[] = [
    product(),
    product({ id: "paused", name: "Pausada", status: "PAUSED" }),
    product({ id: "empty", name: "Sin stock", stock: 0 }),
  ];
  const created: { number: number; total: number; profit: number }[] = [];
  const products: ProductRepository = {
    listPublic: async () => items.filter(isPurchasable).sort(compareCatalogOrder),
    listAll: async () => [...items].sort(compareCatalogOrder),
    get: async (id) => items.find((p) => p.id === id) ?? null,
    create: async (data) => {
      const p = { ...product(), ...data, id: `p${items.length + 1}`, sortOrder: items.length + 1 };
      items.push(p);
      return p;
    },
    update: async (id, data) => {
      const i = items.findIndex((p) => p.id === id);
      if (i < 0) return null;
      items[i] = { ...items[i], ...data };
      return items[i];
    },
    remove: async (id) => {
      const before = items.length;
      items = items.filter((p) => p.id !== id);
      return items.length < before;
    },
    duplicate: async () => null,
  };
  const orders: OrderRepository = {
    create: async (request) => {
      const settings = getSettings();
      if (!settings.ordersEnabled) throw new OrderError("orders_paused");
      if (!settings.whatsappNumber) throw new OrderError("whatsapp_not_configured");
      const priced = priceOrder(request.items, items);
      for (const line of priced.lines) {
        const p = items.find((x) => x.id === line.productId);
        if (p) p.stock -= line.quantity;
      }
      const number = 1001 + created.length;
      created.push({ number, total: priced.totalCents, profit: priced.profitCents });
      return { receipt: toReceipt({ id: `o${number}`, number, itemCount: priced.itemCount }, priced), whatsappNumber: settings.whatsappNumber };
    },
    list: async () => ({ summary: { orders: created.length, revenue: "0.00", profit: "0.00", items: 0 }, orders: [], page: 1, pageSize: 20, totalPages: 1 }),
    get: async () => null,
  };
  const stored = new Map<string, { contentType: string; data: Uint8Array }>();
  const images: ImageRepository = {
    save: async ({ type, data }) => {
      const id = `img${String(stored.size + 1).padStart(10, "0")}`;
      stored.set(id, { contentType: type, data });
      return id;
    },
    get: async (id) => stored.get(id) ?? null,
  };
  return { products, orders, images, items: () => items, created };
}

function setup({ orderLimit = 100 } = {}) {
  let state: AdminSettings = { ...DEFAULT_SETTINGS, whatsappNumber: "5493581234567", instagramHandle: "@sweet.cookies.rio4", updatedAt: null };
  const updates: string[] = [];
  const repo: SettingsRepository = {
    get: async () => state,
    update: async (data, by) => {
      updates.push(by);
      state = { ...state, ...data, updatedAt: new Date(0).toISOString() };
      return state;
    },
    updateOrders: async (data, by) => {
      updates.push(by);
      state = { ...state, ...data, updatedAt: new Date(0).toISOString() };
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
  const memory = memoryRepos(() => state);
  const app = createApp({
    repo,
    products: memory.products,
    orders: memory.orders,
    images: memory.images,
    auth,
    allowedOrigins: [ORIGIN],
    orderLimiter: createRateLimiter({ limit: orderLimit, windowMs: 60_000 }),
    log: (m) => logs.push(m),
  });
  return { app, updates, logs, memory };
}

const order = (body: unknown) =>
  new Request("http://api/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "fly-client-ip": "203.0.113.7" },
    body: JSON.stringify(body),
  });

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
    // whatsappOrdersEnabled: alias del nombre anterior, para la web que todavía no se actualizó.
    assert.deepEqual(Object.keys(await json(res)).sort(), ["instagramHandle", "ordersDisabledMessage", "ordersEnabled", "whatsappNumber", "whatsappOrdersEnabled"]);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });

  it("admin sin token → 401", async () => {
    const res = await setup().app.request("/api/admin/settings");
    assert.equal(res.status, 401);
  });

  it("admin con usuario sin rol → 403", async () => {
    const res = await setup().app.request("/api/admin/settings", { headers: { Authorization: "Bearer user-token" } });
    assert.equal(res.status, 403);
    const put403 = await setup().app.request(put("user-token", { whatsappNumber: "5493584123456", ordersEnabled: true }));
    assert.equal(put403.status, 403);
  });

  it("admin → 200, guarda normalizado y audita", async () => {
    const { app, updates } = setup();
    const res = await app.request(put("admin-token", { whatsappNumber: "+54 9 358 412-3456", instagramHandle: "@sweet.cookies.rio4", ordersEnabled: false }));
    assert.equal(res.status, 200);
    const saved = await json(res);
    assert.equal(saved.whatsappNumber, "5493584123456");
    assert.equal(saved.ordersEnabled, false);
    assert.deepEqual(updates, ["user_admin"]);
    const pub = await json(await app.request("/api/public/settings"));
    assert.equal(pub.whatsappNumber, "5493584123456");
    assert.equal(pub.ordersEnabled, false);
  });

  it("validación → 422 con errores por campo; JSON roto → 400", async () => {
    const { app } = setup();
    const res = await app.request(put("admin-token", { whatsappNumber: "12", ordersEnabled: true }));
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
    const memory = memoryRepos(() => ({ ...DEFAULT_SETTINGS, updatedAt: null }));
    const failing = createApp({
      products: memory.products,
      orders: memory.orders,
      images: memory.images,
      repo: { get: async () => { throw new Error("postgres://user:secret@host/db"); }, update: async () => { throw new Error(); }, updateOrders: async () => { throw new Error(); }, ping: async () => {} },
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
  it("catálogo público: solo activos con stock, sin costo ni ganancia", async () => {
    const res = await setup().app.request("/api/public/products");
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.deepEqual(body.products.map((p: { id: string }) => p.id), ["chips"]);
    assert.deepEqual(Object.keys(body.products[0]).sort(), [
      "boxImageRotation",
      "boxImageScale",
      "boxImageUrl",
      "boxImageX",
      "boxImageY",
      "category",
      "description",
      "featured",
      "id",
      "imageUrl",
      "name",
      "price",
      "stock",
    ]);
    assert.ok(!JSON.stringify(body).includes("cost"));
  });

  it("admin de productos y pedidos: sin token 401, sin rol 403, admin ve costos", async () => {
    const { app } = setup();
    assert.equal((await app.request("/api/admin/products")).status, 401);
    assert.equal((await app.request("/api/admin/orders")).status, 401);
    const routes: [string, string][] = [
      ["GET", "/api/admin/products"],
      ["GET", "/api/admin/products/chips"],
      ["POST", "/api/admin/products"],
      ["PATCH", "/api/admin/products/chips"],
      ["DELETE", "/api/admin/products/chips"],
      ["POST", "/api/admin/products/chips/duplicate"],
      ["GET", "/api/admin/orders"],
      ["GET", "/api/admin/orders/o1"],
    ];
    for (const [method, path] of routes) {
      const r = await app.request(path, {
        method,
        headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" },
        body: method === "GET" || method === "DELETE" ? undefined : "{}",
      });
      assert.equal(r.status, 403, `${method} ${path}`);
    }
    const res = await app.request("/api/admin/products", { headers: { Authorization: "Bearer admin-token" } });
    const body = await json(res);
    assert.equal(body.products.length, 3);
    assert.equal(body.products.find((p: { id: string }) => p.id === "chips").cost, "2500.00");
    assert.equal(body.products.find((p: { id: string }) => p.id === "empty").displayStatus, "OUT_OF_STOCK");
  });

  it("admin crea, pausa, repone y elimina: el catálogo público lo refleja", async () => {
    const { app } = setup();
    const admin = { Authorization: "Bearer admin-token", "Content-Type": "application/json" };
    const created = await app.request("/api/admin/products", { method: "POST", headers: admin, body: JSON.stringify({ name: "Double Chocolate", price: "6000", cost: "3000", stock: 5 }) });
    assert.equal(created.status, 201);
    const id = (await json(created)).id;
    const ids = async () => (await json(await app.request("/api/public/products"))).products.map((p: { id: string }) => p.id);
    const patch = (body: unknown) => app.request(`/api/admin/products/${id}`, { method: "PATCH", headers: admin, body: JSON.stringify(body) });
    assert.ok((await ids()).includes(id));
    assert.equal((await patch({ status: "PAUSED" })).status, 200);
    assert.ok(!(await ids()).includes(id));
    assert.equal((await patch({ status: "ACTIVE", stock: 0 })).status, 200);
    assert.ok(!(await ids()).includes(id));
    assert.equal((await patch({ stock: 3 })).status, 200);
    assert.ok((await ids()).includes(id));
    assert.equal((await patch({ price: "-5" })).status, 422);
    assert.equal((await app.request(`/api/admin/products/${id}`, { method: "DELETE", headers: admin })).status, 204);
    assert.equal((await app.request(`/api/admin/products/${id}`, { method: "DELETE", headers: admin })).status, 404);
  });

  it("POST /api/orders: calcula en el servidor, descuenta stock y devuelve el WhatsApp del negocio", async () => {
    const { app, memory } = setup();
    const res = await app.request(order({ items: [{ productId: "chips", quantity: 3, price: 1 }], customer: { name: "Juan", deliveryMethod: "PICKUP" }, total: 1 }));
    assert.equal(res.status, 201);
    const body = await json(res);
    assert.equal(body.order.number, 1001);
    assert.equal(body.order.total, "15000.00");
    assert.equal(body.whatsappNumber, "5493581234567");
    assert.ok(!JSON.stringify(body).includes("profit"));
    assert.equal(memory.items().find((p) => p.id === "chips")?.stock, 7);
  });

  it("POST /api/orders: stock insuficiente o producto pausado → 409 y sin cambios", async () => {
    const { app, memory } = setup();
    const res = await app.request(order({ items: [{ productId: "chips", quantity: 11 }], customer: { name: "Ana", deliveryMethod: "PICKUP" } }));
    assert.equal(res.status, 409);
    assert.equal((await json(res)).problems[0].available, 10);
    const paused = await app.request(order({ items: [{ productId: "chips", quantity: 1 }, { productId: "paused", quantity: 1 }], customer: { name: "Ana", deliveryMethod: "PICKUP" } }));
    assert.equal(paused.status, 409);
    assert.equal(memory.items().find((p) => p.id === "chips")?.stock, 10);
    assert.equal(memory.created.length, 0);
  });

  it("POST /api/orders: pedidos pausados, validación, CORS y límite por IP", async () => {
    const { app } = setup({ orderLimit: 2 });
    await app.request(put("admin-token", { whatsappNumber: "5493581234567", ordersEnabled: false }));
    const paused = await app.request(order({ items: [{ productId: "chips", quantity: 1 }], customer: { name: "Ana", deliveryMethod: "PICKUP" } }));
    assert.equal(paused.status, 409);
    assert.equal((await json(paused)).error, "orders_paused");
    assert.equal((await app.request(order({ items: [], customer: {} }))).status, 422);
    assert.equal((await app.request(order({ items: [], customer: {} }))).status, 429);
    const preflight = await setup().app.request("/api/orders", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
    assert.notEqual(preflight.headers.get("access-control-allow-origin"), "*");
    assert.notEqual(preflight.headers.get("access-control-allow-origin"), "https://evil.example");
  });
  it("subida de imágenes: solo admin, valida contenido y se sirve con caché inmutable", async () => {
    const { app } = setup();
    const upload = (token: string | null, body: Uint8Array, type: string) =>
      app.request("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body,
      });
    assert.equal((await upload(null, PNG_1x1, "image/png")).status, 401);
    assert.equal((await upload("user-token", PNG_1x1, "image/png")).status, 403);
    assert.equal((await upload("admin-token", new TextEncoder().encode("<svg/>"), "image/svg+xml")).status, 422);
    const ok = await upload("admin-token", PNG_1x1, "image/png");
    assert.equal(ok.status, 201);
    const { url } = await json(ok);
    assert.match(url, /^\/api\/public\/images\/img\d{10}$/);
    const res = await app.request(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG_1x1);
    assert.equal((await app.request("/api/public/images/noexiste00000")).status, 404);
    assert.equal((await app.request("/api/public/images/..%2F..%2Fetc")).status, 404);
  });

  it("edición rápida: PATCH parcial de precio o stock, validado en el servidor", async () => {
    const { app } = setup();
    const admin = { Authorization: "Bearer admin-token", "Content-Type": "application/json" };
    const patch = (body: unknown) => app.request("/api/admin/products/chips", { method: "PATCH", headers: admin, body: JSON.stringify(body) });
    const price = await json(await patch({ price: "4500" }));
    assert.equal(price.price, "4500.00");
    assert.equal(price.stock, 10, "no toca el resto");
    const zero = await json(await patch({ stock: 0 }));
    assert.equal(zero.displayStatus, "OUT_OF_STOCK");
    assert.equal((await json(await app.request("/api/public/products"))).products.length, 0);
    const back = await json(await patch({ stock: 10 }));
    assert.equal(back.displayStatus, "ACTIVE");
    assert.equal((await patch({ stock: -1 })).status, 422);
    assert.equal((await patch({ price: "abc" })).status, 422);
    const one = await json(await app.request("/api/admin/products/chips", { headers: admin }));
    assert.equal(one.price, "4500.00");
    assert.equal((await app.request("/api/admin/products/nope", { headers: admin })).status, 404);
  });

  it("vista en caja: se guarda y se valida al editar", async () => {
    const { app } = setup();
    const admin = { Authorization: "Bearer admin-token", "Content-Type": "application/json" };
    const patch = (body: unknown) => app.request("/api/admin/products/chips", { method: "PATCH", headers: admin, body: JSON.stringify(body) });
    const ok = await json(await patch({ boxImageScale: 1.8, boxImageX: 40, boxImageY: 60, boxImageRotation: 10, boxImageUrl: "/api/public/images/img0000000001" }));
    assert.equal(ok.boxImageScale, 1.8);
    assert.equal(ok.boxImageUrl, "/api/public/images/img0000000001");
    assert.equal((await patch({ boxImageScale: 9 })).status, 422);
    const pub = (await json(await app.request("/api/public/products"))).products[0];
    assert.equal(pub.boxImageX, 40);
    assert.equal(pub.imageUrl, "/images/cookies/hero-cookie-cutout.png");
  });
  it("interruptor de pedidos: solo admin, guarda al instante y no toca el resto", async () => {
    const { app } = setup();
    const patch = (token: string | null, body: unknown) =>
      app.request("/api/admin/settings/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    assert.equal((await patch(null, { ordersEnabled: false })).status, 401);
    assert.equal((await patch("user-token", { ordersEnabled: false })).status, 403);
    assert.equal((await patch("admin-token", { ordersEnabled: "no" })).status, 422);
    assert.equal((await patch("admin-token", { ordersDisabledMessage: "x".repeat(201) })).status, 422);
    assert.equal((await patch("admin-token", {})).status, 422);
    const paused = await json(await patch("admin-token", { ordersEnabled: false, ordersDisabledMessage: "  Estamos de vacaciones hasta el 15 de octubre.  " }));
    assert.equal(paused.ordersEnabled, false);
    assert.equal(paused.ordersDisabledMessage, "Estamos de vacaciones hasta el 15 de octubre.");
    assert.equal(paused.whatsappNumber, "5493581234567", "el teléfono sigue guardado");
    const pub = await json(await app.request("/api/public/settings"));
    assert.equal(pub.ordersEnabled, false);
    assert.equal(pub.ordersDisabledMessage, "Estamos de vacaciones hasta el 15 de octubre.");
  });

  it("pedidos pausados: catálogo visible, pedido rechazado, sin Order y sin tocar stock; al reactivar vuelve a funcionar", async () => {
    const { app, memory } = setup();
    const patch = (body: unknown) =>
      app.request("/api/admin/settings/orders", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer admin-token" }, body: JSON.stringify(body) });
    await patch({ ordersEnabled: false });
    assert.equal((await json(await app.request("/api/public/products"))).products.length, 1, "los productos se siguen viendo");
    const rejected = await app.request(order({ items: [{ productId: "chips", quantity: 2 }], customer: { name: "Ana", deliveryMethod: "PICKUP" } }));
    assert.equal(rejected.status, 409);
    assert.deepEqual(await json(rejected), { error: "orders_paused" });
    assert.equal(memory.created.length, 0);
    assert.equal(memory.items().find((p) => p.id === "chips")?.stock, 10);
    await patch({ ordersEnabled: true });
    const ok = await app.request(order({ items: [{ productId: "chips", quantity: 2 }], customer: { name: "Ana", deliveryMethod: "PICKUP" } }));
    assert.equal(ok.status, 201);
    assert.equal(memory.items().find((p) => p.id === "chips")?.stock, 8);
  });

  it("compatibilidad: acepta el nombre anterior del interruptor", async () => {
    const { app } = setup();
    const res = await app.request(put("admin-token", { whatsappNumber: "5493581234567", whatsappOrdersEnabled: false }));
    assert.equal(res.status, 200);
    assert.equal((await json(res)).ordersEnabled, false);
  });
});
