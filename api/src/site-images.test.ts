import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { ImageRepository } from "./image-repository.ts";
import type { SiteContentRepository } from "./site-content-repository.ts";
import type { SiteTextRow } from "./site-content.ts";
import { registerSiteContentRoutes } from "./site-content-routes.ts";
import { toAdminSiteImages, toPublicSiteImages, validateSiteImageInput } from "./site-images.ts";

const IMG = "/api/public/images/img0000000001";

describe("fotos del sitio: validación", () => {
  it("acepta una imagen subida o null (volver a la original)", () => {
    assert.deepEqual(validateSiteImageInput({ url: IMG }), { ok: true, url: IMG, framing: null });
    assert.deepEqual(validateSiteImageInput({ url: null }), { ok: true, url: null, framing: null });
  });

  it("rechaza URLs externas, rutas del sitio y formatos raros", () => {
    for (const url of ["https://otra-web.com/x.jpg", "/images/cookies/box-cookies.jpg", "javascript:alert(1)", `${IMG}/../x`, 42, ""]) {
      assert.equal(validateSiteImageInput({ url }).ok, false, String(url));
    }
    assert.equal(validateSiteImageInput(null).ok, false);
    assert.equal(validateSiteImageInput({}).ok, false);
  });

  it("la web solo recibe fotos conocidas con rutas válidas (los textos no se mezclan)", () => {
    const rows: SiteTextRow[] = [
      { key: "BOX_IMAGE", value: IMG, updatedAt: new Date(0) },
      { key: "BOX_TITLE", value: "Armá tu box", updatedAt: new Date(0) },
      { key: "OTRA_FOTO", value: IMG, updatedAt: new Date(0) },
    ];
    assert.deepEqual(toPublicSiteImages(rows), { BOX_IMAGE: IMG });
    assert.deepEqual(toAdminSiteImages([]).images.map((i) => [i.key, i.url]), [["BOX_IMAGE", null]]);
  });
});

function setup() {
  let rows: SiteTextRow[] = [];
  const content: SiteContentRepository = {
    list: async () => rows,
    save: async () => rows,
    saveImage: async (key, url, framing) => {
      rows = rows.filter((r) => r.key !== key && r.key !== `${key}_FRAMING`);
      if (url) rows.push({ key, value: url, updatedAt: new Date(0) });
      if (framing) rows.push({ key: `${key}_FRAMING`, value: JSON.stringify(framing), updatedAt: new Date(0) });
      return rows;
    },
  };
  const images: ImageRepository = {
    save: async () => "unused",
    get: async (id) => (id === "img0000000001" ? { contentType: "image/webp", data: new Uint8Array([1]) } : null),
  };
  const app = new Hono<{ Variables: { userId: string } }>();
  // Las rutas admin llegan ya autenticadas por el middleware de app.ts.
  app.use("/api/admin/*", async (c, next) => {
    c.set("userId", "user_admin");
    await next();
  });
  registerSiteContentRoutes(app, { content, images, log: () => {} });
  const put = (key: string, body: unknown) =>
    app.request(`/api/admin/content/images/${key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { app, put };
}

describe("fotos del sitio: encuadre", () => {
  const framing = { mobile: { scale: 0.45, x: 30, y: 70 }, desktop: { scale: 2.5, x: 140, y: -20 } };
  it("acepta achicar (hasta 20 %), agrandar (hasta 300 %) y mover libremente, por dispositivo", () => {
    assert.deepEqual(validateSiteImageInput({ url: IMG, framing }), { ok: true, url: IMG, framing });
    const centered = { mobile: { scale: 1, x: 50, y: 50 }, desktop: { scale: 1, x: 50, y: 50 } };
    assert.deepEqual(validateSiteImageInput({ url: null, framing: centered }), { ok: true, url: null, framing: centered });
    assert.deepEqual(validateSiteImageInput({ url: IMG, framing: null }), { ok: true, url: IMG, framing: null });
  });
  it("rechaza tamaño o posición fuera de rango, o encuadre incompleto", () => {
    for (const bad of [
      { mobile: { scale: 0.1, x: 50, y: 50 }, desktop: { scale: 1, x: 50, y: 50 } },
      { mobile: { scale: 3.5, x: 50, y: 50 }, desktop: { scale: 1, x: 50, y: 50 } },
      { mobile: { scale: 1, x: 151, y: 50 }, desktop: { scale: 1, x: 50, y: 50 } },
      { mobile: { scale: 1, x: 50, y: -51 }, desktop: { scale: 1, x: 50, y: 50 } },
      { mobile: { scale: 1, x: 50, y: 50 } },
      "x",
    ]) {
      assert.equal(validateSiteImageInput({ url: IMG, framing: bad }).ok, false, JSON.stringify(bad));
    }
  });
  it("el encuadre se guarda, la web lo recibe y el panel lo recupera (también con la foto original)", async () => {
    const { app, put } = setup();
    assert.equal((await put("BOX_IMAGE", { url: null, framing })).status, 200);
    const pub = (await (await app.request("/api/public/content")).json()) as { images: unknown; framings: unknown };
    assert.deepEqual(pub.images, {});
    assert.deepEqual(pub.framings, { BOX_IMAGE: framing });
    const admin = (await (await app.request("/api/admin/content/images")).json()) as { images: { framing: unknown }[] };
    assert.deepEqual(admin.images[0].framing, framing);
  });
});

describe("fotos del sitio: rutas", () => {
  it("guardar → la web la recibe; volver a la original → desaparece", async () => {
    const { app, put } = setup();
    assert.equal((await put("BOX_IMAGE", { url: IMG })).status, 200);
    assert.deepEqual(((await (await app.request("/api/public/content")).json()) as { images: unknown }).images, { BOX_IMAGE: IMG });
    assert.equal((await put("BOX_IMAGE", { url: null })).status, 200);
    assert.deepEqual(((await (await app.request("/api/public/content")).json()) as { images: unknown }).images, {});
  });

  it("rechaza imágenes que no existen, inválidas o claves desconocidas", async () => {
    const { put } = setup();
    assert.equal((await put("BOX_IMAGE", { url: "/api/public/images/img9999999999" })).status, 422);
    assert.equal((await put("BOX_IMAGE", { url: "https://otra-web.com/x.jpg" })).status, 422);
    assert.equal((await put("HOME_TITLE", { url: IMG })).status, 404);
  });
});
