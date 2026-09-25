import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBoxLayout } from "./box.ts";
import { boxFormat, boxImageStyle, boxViewSource } from "./box-view.ts";
import { DEFAULT_BOX_VIEW } from "./catalog.ts";

describe("vista en caja: prioridad de imagen", () => {
  it("sin imagen de caja usa la foto principal con su encuadre", () => {
    const view = boxViewSource({ ...DEFAULT_BOX_VIEW, imageUrl: "/images/cookies/pistacho.jpg", boxImageScale: 1.6, boxImageX: 30 });
    assert.deepEqual(view, { src: "/images/cookies/pistacho.jpg", specific: false, scale: 1.6, x: 30, y: 50, rotation: 0 });
  });
  it("con imagen de caja, esa tiene prioridad", () => {
    const view = boxViewSource({ ...DEFAULT_BOX_VIEW, imageUrl: "/images/cookies/pistacho.jpg", boxImageUrl: "/api/public/images/abcdefghijkl" });
    assert.equal(view.src, "/api/public/images/abcdefghijkl");
    assert.equal(view.specific, true);
  });
  it("sin ninguna imagen queda vacía", () => {
    assert.equal(boxViewSource({ ...DEFAULT_BOX_VIEW, imageUrl: null }).src, null);
  });
  it("el zoom y la rotación giran alrededor del punto elegido", () => {
    assert.deepEqual(boxImageStyle({ scale: 2, x: 25, y: 70, rotation: -10 }), {
      objectPosition: "25% 70%",
      transformOrigin: "25% 70%",
      transform: "scale(2) rotate(-10deg)",
    });
    assert.equal(boxImageStyle({ scale: 1, x: 50, y: 50, rotation: 0 }).transform, "scale(1)");
  });
});

describe("formato de la caja (lugares fijos)", () => {
  it("elige la caja más chica donde entra el pedido", () => {
    assert.deepEqual(boxFormat(0), { capacity: 6, columns: 3, rows: 2 });
    assert.deepEqual(boxFormat(6), { capacity: 6, columns: 3, rows: 2 });
    assert.deepEqual(boxFormat(7), { capacity: 8, columns: 4, rows: 2 });
    assert.deepEqual(boxFormat(9), { capacity: 12, columns: 4, rows: 3 });
    assert.deepEqual(boxFormat(13), { capacity: 16, columns: 4, rows: 4 });
  });
  it("cada cookie va a un lugar distinto y los libres quedan vacíos", () => {
    const format = boxFormat(5);
    const layout = buildBoxLayout(
      [
        { id: "a", quantity: 3 },
        { id: "b", quantity: 2 },
      ],
      { columns: format.columns, maxVisible: 16, capacity: format.capacity },
    );
    assert.equal(layout.units.length, 5);
    assert.equal(new Set(layout.units.map((u) => u.key)).size, 5, "una key (lugar) por cookie");
    assert.equal(layout.units.length + layout.emptySlots, 6);
  });
});
