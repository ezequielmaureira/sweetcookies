import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moveId, reorderErrorMessage } from "./product-order.ts";

const apiError = (status: number) => ({ status, fields: {} });

const ids = ["chips", "pistacho", "nutella", "franui", "oreo"];

describe("orden de la web", () => {
  it("Oreo del puesto 5 al 1 (arrastrar o flechas repetidas)", () => {
    assert.deepEqual(moveId(ids, "oreo", 0), ["oreo", "chips", "pistacho", "nutella", "franui"]);
  });
  it("flecha ↑ y ↓ mueven un lugar", () => {
    assert.deepEqual(moveId(ids, "nutella", 1), ["chips", "nutella", "pistacho", "franui", "oreo"]);
    assert.deepEqual(moveId(ids, "nutella", 3), ["chips", "pistacho", "franui", "nutella", "oreo"]);
  });
  it("soltar sobre otra fila deja la cookie en el lugar de esa fila", () => {
    assert.deepEqual(moveId(ids, "chips", 4), ["pistacho", "nutella", "franui", "oreo", "chips"]);
  });
  it("movimientos sin efecto o inválidos → null (no se manda nada)", () => {
    assert.equal(moveId(ids, "oreo", 4), null);
    assert.equal(moveId(ids, "oreo", 5), null);
    assert.equal(moveId(ids, "oreo", -1), null);
    assert.equal(moveId(ids, "no-existe", 0), null);
  });
  it("el error muestra la causa real", () => {
    assert.match(reorderErrorMessage(apiError(404)), /falta actualizar la API/);
    assert.match(reorderErrorMessage(apiError(403)), /permisos/);
    assert.match(reorderErrorMessage(apiError(0)), /conexión/);
    assert.match(reorderErrorMessage(apiError(500)), /error 500/);
    assert.match(reorderErrorMessage(new Error("x")), /No pudimos guardar el orden/);
  });
});
