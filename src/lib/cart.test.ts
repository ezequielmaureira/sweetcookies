import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_CART, MAX_QUANTITY_PER_FLAVOR, countItems, sanitizeCartItems, withQuantity } from "./cart.ts";

const ids = new Set(["pistacho", "red-velvet"]);

describe("sanitizeCartItems", () => {
  it("ignora ids inexistentes y cantidades inválidas", () => {
    const result = sanitizeCartItems(
      { pistacho: 2, "sabor-viejo": 3, "red-velvet": -1, x: "2" },
      ids,
    );
    assert.deepEqual(result, { pistacho: 2 });
  });
  it("tolera basura", () => {
    assert.equal(sanitizeCartItems(null, ids), EMPTY_CART);
    assert.equal(sanitizeCartItems([1, 2], ids), EMPTY_CART);
    assert.equal(sanitizeCartItems("hola", ids), EMPTY_CART);
  });
  it("redondea y limita cantidades", () => {
    assert.deepEqual(sanitizeCartItems({ pistacho: 2.7, "red-velvet": 1000 }, ids), {
      pistacho: 2,
      "red-velvet": MAX_QUANTITY_PER_FLAVOR,
    });
  });
});

describe("withQuantity", () => {
  it("agrega, actualiza y elimina manteniendo el orden", () => {
    let items = withQuantity(EMPTY_CART, "pistacho", 1);
    items = withQuantity(items, "red-velvet", 2);
    items = withQuantity(items, "pistacho", 3);
    assert.deepEqual(Object.keys(items), ["pistacho", "red-velvet"]);
    assert.equal(countItems(items), 5);
    items = withQuantity(items, "pistacho", 0);
    assert.deepEqual(items, { "red-velvet": 2 });
  });
  it("devuelve la misma referencia si no cambia", () => {
    const items = { pistacho: 1 };
    assert.equal(withQuantity(items, "pistacho", 1), items);
    assert.equal(withQuantity(items, "red-velvet", 0), items);
  });
});

