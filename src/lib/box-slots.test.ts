import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_SLOTS, reconcileSlots, type SlotState } from "./box-slots.ts";

const ids = (state: SlotState) => state.slots.map((u) => (u ? u.flavorId : "·")).join(",");

describe("lugares de la caja", () => {
  it("al agregar, cada cookie ocupa el siguiente lugar (en orden de llegada)", () => {
    let s = reconcileSlots(EMPTY_SLOTS, [{ id: "pistacho", quantity: 1 }]);
    s = reconcileSlots(s, [
      { id: "pistacho", quantity: 1 },
      { id: "red", quantity: 1 },
    ]);
    s = reconcileSlots(s, [
      { id: "pistacho", quantity: 2 },
      { id: "red", quantity: 1 },
    ]);
    assert.equal(ids(s), "pistacho,red,pistacho");
  });

  it("al quitar se libera ese lugar y las demás no se mueven", () => {
    let s = reconcileSlots(EMPTY_SLOTS, [
      { id: "a", quantity: 2 },
      { id: "b", quantity: 2 },
    ]);
    const bKeys = s.slots.filter((u) => u?.flavorId === "b").map((u) => u?.key);
    s = reconcileSlots(s, [
      { id: "a", quantity: 1 },
      { id: "b", quantity: 2 },
    ]);
    assert.equal(ids(s), "a,·,b,b");
    assert.deepEqual(s.slots.filter((u) => u?.flavorId === "b").map((u) => u?.key), bKeys, "las de b conservan su lugar");
  });

  it("la próxima cookie ocupa el lugar libre", () => {
    let s = reconcileSlots(EMPTY_SLOTS, [
      { id: "a", quantity: 2 },
      { id: "b", quantity: 2 },
    ]);
    s = reconcileSlots(s, [
      { id: "a", quantity: 1 },
      { id: "b", quantity: 2 },
    ]);
    s = reconcileSlots(s, [
      { id: "a", quantity: 1 },
      { id: "b", quantity: 2 },
      { id: "c", quantity: 1 },
    ]);
    assert.equal(ids(s), "a,c,b,b");
  });

  it("quitar la última no deja huecos al final", () => {
    let s = reconcileSlots(EMPTY_SLOTS, [{ id: "a", quantity: 3 }]);
    s = reconcileSlots(s, [{ id: "a", quantity: 2 }]);
    assert.equal(ids(s), "a,a");
  });

  it("si entra en una caja más chica, se reacomoda sin huecos", () => {
    // 7 cookies → caja de 8; con un hueco al principio y bajando a 6 → caja de 6: se compacta.
    let s = reconcileSlots(EMPTY_SLOTS, [
      { id: "a", quantity: 1 },
      { id: "b", quantity: 6 },
    ]);
    s = reconcileSlots(s, [{ id: "b", quantity: 6 }]);
    assert.equal(ids(s), "b,b,b,b,b,b");
  });

  it("sin cambios devuelve el mismo estado (sin renders de más)", () => {
    const s = reconcileSlots(EMPTY_SLOTS, [{ id: "a", quantity: 2 }]);
    assert.equal(reconcileSlots(s, [{ id: "a", quantity: 2 }]), s);
  });

  it("vaciar la caja deja todo libre", () => {
    const s = reconcileSlots(reconcileSlots(EMPTY_SLOTS, [{ id: "a", quantity: 3 }]), []);
    assert.equal(s.slots.length, 0);
  });
});
