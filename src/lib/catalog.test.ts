import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BOX_VIEW, availabilityLabel, formatCents, parseCatalog, resolveImageSrc, toCents } from "./catalog.ts";

const item = {
  id: "chips",
  name: "Cookie Chips",
  description: null,
  price: "5000.00",
  stock: 4,
  imageUrl: "/images/cookies/a.jpg",
  category: "Cookies",
  featured: true,
  ...DEFAULT_BOX_VIEW,
};

describe("catálogo público", () => {
  it("acepta productos válidos y nunca agrega campos del admin", () => {
    const [p] = parseCatalog({ products: [{ ...item, cost: "2500.00" }] }) ?? [];
    assert.deepEqual(p, item);
    assert.ok(!("cost" in (p as object)));
  });
  it("descarta productos sin stock, sin precio o con imagen peligrosa", () => {
    const list = parseCatalog({
      products: [
        { ...item, id: "a", stock: 0 },
        { ...item, id: "b", price: "0.00" },
        { ...item, id: "c", imageUrl: "javascript:alert(1)" },
        { ...item, id: "d e" },
      ],
    });
    assert.deepEqual(list?.map((p) => [p.id, p.imageUrl]), [["c", null]]);
    assert.equal(parseCatalog({}), null);
    assert.equal(parseCatalog(null), null);
  });
  it("vista en caja: valores fuera de rango se acotan y URLs peligrosas se descartan", () => {
    const [p] =
      parseCatalog({
        products: [{ ...item, boxImageUrl: "javascript:alert(1)", boxImageScale: 12, boxImageX: -5, boxImageY: "x", boxImageRotation: 400 }],
      }) ?? [];
    assert.equal(p.boxImageUrl, null);
    assert.equal(p.boxImageScale, 4);
    assert.equal(p.boxImageX, 0);
    assert.equal(p.boxImageY, 50);
    assert.equal(p.boxImageRotation, 180);
    const [q] = parseCatalog({ products: [{ ...item, boxImageUrl: "/api/public/images/abcdefghijkl" }] }) ?? [];
    assert.equal(q.boxImageUrl, "/api/public/images/abcdefghijkl");
  });
  it("las imágenes subidas se sirven desde la API; el resto no cambia", () => {
    assert.equal(resolveImageSrc("/images/cookies/a.jpg"), "/images/cookies/a.jpg");
    assert.equal(resolveImageSrc(null), null);
    const uploaded = resolveImageSrc("/api/public/images/abcdefghijkl");
    assert.ok(uploaded === null || uploaded.endsWith("/api/public/images/abcdefghijkl"));
  });
  it("centavos exactos y formato de pesos", () => {
    assert.equal(toCents("5000.50"), 500050);
    assert.equal(toCents("abc"), 0);
    assert.match(formatCents(500000), /^\$\s?5\.000$/);
    assert.match(formatCents(500050), /^\$\s?5\.000,50$/);
  });
  it("aviso de pocas unidades", () => {
    assert.equal(availabilityLabel(20), null);
    assert.equal(availabilityLabel(3), "Quedan 3");
    assert.equal(availabilityLabel(1), "¡Queda 1!");
  });
});
