import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoBrushSize, fitRect, revealedFraction, strokePoints } from "./cookie-reveal.ts";

describe("fitRect", () => {
  it("cover llena la caja y recorta según el punto focal", () => {
    assert.deepEqual(fitRect(1000, 2000, 100, 100, "cover", { x: 0.5, y: 0.5 }), { x: 0, y: -50, width: 100, height: 200 });
    assert.deepEqual(fitRect(1000, 2000, 100, 100, "cover", { x: 0.5, y: 0 }), { x: 0, y: -0, width: 100, height: 200 });
  });
  it("contain entra completa y centrada", () => {
    assert.deepEqual(fitRect(2000, 1000, 100, 100, "contain", { x: 0.5, y: 0.5 }), { x: 0, y: 25, width: 100, height: 50 });
  });
});

describe("strokePoints", () => {
  it("un movimiento rápido se rellena sin huecos", () => {
    const points = strokePoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    assert.equal(points.length, 10);
    assert.deepEqual(points.at(-1), { x: 100, y: 0 });
    for (let i = 1; i < points.length; i++) assert.ok(points[i].x - points[i - 1].x <= 10);
  });
  it("sin movimiento devuelve el mismo punto", () => {
    assert.deepEqual(strokePoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10), [{ x: 5, y: 5 }]);
  });
});

describe("autoBrushSize", () => {
  it("se mantiene entre 44 y 72 px", () => {
    assert.equal(autoBrushSize(200, 200), 44);
    assert.equal(autoBrushSize(340, 340), 61);
    assert.equal(autoBrushSize(900, 900), 72);
  });
});

describe("revealedFraction", () => {
  const mask = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  it("cuenta los píxeles borrados", () => {
    assert.equal(revealedFraction(mask, null), 0.5);
  });
  it("con pesos ignora las zonas transparentes de la tapa", () => {
    assert.equal(revealedFraction(mask, new Float32Array([1, 1, 0, 0])), 1);
  });
});
