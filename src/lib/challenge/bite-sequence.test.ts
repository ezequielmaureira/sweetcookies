import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COOKIE_RADIUS, SEQUENCE_VARIANTS, createCookieSequence, polygonCells, sequenceFor } from "./bite-sequence.ts";
import { BITES_PER_COOKIE } from "./scoring.ts";

const sequence = createCookieSequence(1103);
const center = (points: readonly { x: number; y: number }[]) => {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
};

describe("secuencia de mordidas", () => {
  it("son 30 mordidas y solo la última termina la cookie", () => {
    assert.equal(sequence.length, BITES_PER_COOKIE);
    sequence.forEach((bite, i) => assert.equal(bite.final, i === BITES_PER_COOKIE - 1));
    assert.equal(sequence.at(-1)?.remaining, 0);
  });

  it("es determinista", () => {
    assert.deepEqual(createCookieSequence(1103), sequence);
  });

  it("cada mordida se lleva algo, sin saltos bruscos", () => {
    let previous = 1;
    for (const bite of sequence.slice(0, -1)) {
      assert.ok(bite.remaining < previous, `no mordió: ${bite.remaining} >= ${previous}`);
      // Ninguna mordida se lleva más de un 20 % de la cookie de golpe.
      assert.ok(previous - bite.remaining < 0.2, `mordida demasiado grande: ${previous - bite.remaining}`);
      previous = bite.remaining;
    }
  });

  it("avanza parejo: a mitad de camino queda cerca de la mitad y al final casi nada", () => {
    const half = sequence[14].remaining;
    assert.ok(half > 0.3 && half < 0.7, `a mitad queda ${half}`);
    assert.ok(sequence[BITES_PER_COOKIE - 2].remaining < 0.15, `antes del último bocado queda ${sequence[BITES_PER_COOKIE - 2].remaining}`);
  });

  it("empieza por el borde y termina cerca del centro", () => {
    const distance = (i: number) => {
      const c = center(sequence[i].outline.filter((p) => Math.hypot(p.x - 50, p.y - 50) < COOKIE_RADIUS));
      return Math.hypot(c.x - 50, c.y - 50);
    };
    assert.ok(distance(0) > 35, `la primera mordida está a ${distance(0)} del centro`);
    assert.ok(distance(BITES_PER_COOKIE - 2) < distance(0));
  });

  it("dos mordidas seguidas no caen en el mismo lugar", () => {
    for (let i = 1; i < 10; i++) {
      const a = center(sequence[i - 1].outline);
      const b = center(sequence[i].outline);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 5, `mordidas ${i - 1} y ${i} superpuestas`);
    }
  });

  it("la capa de miga es un agujero más chico que la mordida", () => {
    for (const bite of sequence.slice(0, 10)) {
      const grid = new Uint8Array(100 * 100).fill(1);
      const whole = polygonCells(grid, bite.outline, false);
      const rim = polygonCells(grid, bite.rimOutline, false);
      assert.ok(rim < whole, `miga ${rim} >= mordida ${whole}`);
    }
  });

  it("siempre hay migas", () => {
    for (const bite of sequence) assert.ok(bite.crumbs.length > 0);
  });

  it("las variantes son distintas y se reutilizan", () => {
    assert.notDeepEqual(sequenceFor(0)[0].outline, sequenceFor(1)[0].outline);
    assert.equal(sequenceFor(0), sequenceFor(SEQUENCE_VARIANTS));
  });
});

describe("polygonCells", () => {
  it("cuenta y borra las celdas dentro del polígono", () => {
    const grid = new Uint8Array(100 * 100).fill(1);
    const square = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ];
    assert.equal(polygonCells(grid, square, false), 100);
    assert.equal(polygonCells(grid, square, true), 100);
    assert.equal(polygonCells(grid, square, false), 0);
  });
});
