import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BITES, BITE_COUNT, COOKIE_EDGE, DEFAULT_MESSAGES, biteMask, biteOutline, crumbOrigins } from "./bites.ts";

const decode = (mask: string | undefined) => decodeURIComponent(mask?.slice('url("data:image/svg+xml,'.length, -2) ?? "");
const inCookie = (p: { x: number; y: number }) => Math.hypot(p.x - 50, p.y - 50) < COOKIE_EDGE;

/** % aproximado de la cookie que queda después de `count` mordidas (muestreo en grilla). */
function remaining(count: number) {
  const holes = BITES.slice(0, count).flat().map((spec) => biteOutline(spec));
  const inside = (poly: { x: number; y: number }[], x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  let total = 0;
  let left = 0;
  for (let x = 0.5; x < 100; x += 1) {
    for (let y = 0.5; y < 100; y += 1) {
      if (!inCookie({ x, y })) continue;
      total++;
      if (!holes.some((h) => inside(h, x, y))) left++;
    }
  }
  return left / total;
}

describe("mordidas", () => {
  it("son 4, con un mensaje por mordida", () => {
    assert.equal(BITE_COUNT, 4);
    assert.deepEqual([...DEFAULT_MESSAGES], ["Mmm...", "Una más.", "Ya casi.", "Bueno... no quedó nada."]);
  });

  it("sin mordidas no hay máscara", () => {
    assert.equal(biteMask(0), undefined);
  });

  it("la máscara es un SVG con un agujero por mandíbula", () => {
    for (let n = 1; n <= BITE_COUNT; n++) {
      const svg = decode(biteMask(n));
      assert.ok(svg.startsWith("<svg"));
      assert.equal(svg.match(/<path /g)?.length, BITES.slice(0, n).flat().length);
    }
  });

  it("es determinista (misma forma en servidor, cliente y cada visita)", () => {
    assert.equal(biteMask(3), biteMask(3));
    assert.deepEqual(biteOutline(BITES[1][0]), biteOutline(BITES[1][0]));
  });

  it("cada mordida es progresiva: siempre queda menos cookie", () => {
    const left = [0, 1, 2, 3, 4].map(remaining);
    for (let i = 1; i < left.length; i++) assert.ok(left[i] < left[i - 1], `mordida ${i}: ${left[i]} >= ${left[i - 1]}`);
    assert.ok(left[1] > 0.9, "la 1ª es chica");
    // La última deja una porción (cerca de la mitad): el corte sigue la masa entre chips.
    assert.ok(left[4] > 0.3 && left[4] < 0.6, `la última deja una porción lógica: ${left[4]}`);
  });

  it("las mordidas no son círculos: el radio desde su centro varía", () => {
    for (const spec of BITES.flat()) {
      const pts = biteOutline(spec).filter(inCookie);
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
      assert.ok(Math.max(...radii) - Math.min(...radii) > 1);
    }
  });

  it("dos mandíbulas nunca son iguales", () => {
    const shapes = BITES.flat().map((spec) => biteOutline({ ...spec, angle: 0 }).map((p) => p.x.toFixed(1)).join());
    assert.equal(new Set(shapes).size, shapes.length);
  });

  it("la capa de miga (inset) es un agujero más chico", () => {
    const spec = BITES[2][0];
    const depthOf = (inset: number) => Math.min(...biteOutline(spec, inset).map((p) => Math.hypot(p.x - 50, p.y - 50)));
    assert.ok(depthOf(1.7) > depthOf(0));
  });

  it("las migas salen del borde recién mordido, dentro de la cookie", () => {
    for (let i = 0; i < BITE_COUNT; i++) {
      const points = crumbOrigins(i, 4);
      assert.equal(points.length, 4);
      for (const p of points) assert.ok(inCookie(p));
    }
  });
});
