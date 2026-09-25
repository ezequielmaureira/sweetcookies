import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BITE_COUNT, BITES, DEFAULT_MESSAGES, biteCircles, biteMask, bitePoint } from "./bites.ts";

describe("mordidas", () => {
  it("son 3, con un mensaje por mordida", () => {
    assert.equal(BITE_COUNT, 3);
    assert.deepEqual([...DEFAULT_MESSAGES], ["Mmm...", "Una más.", "Bueno... ahora sí."]);
  });
  it("sin mordidas no hay máscara", () => {
    assert.equal(biteMask(0), undefined);
  });
  it("cada mordida suma un núcleo + 7 círculos de dientes", () => {
    const count = (n: number) => (biteMask(n)?.match(/radial-gradient/g) ?? []).length;
    assert.equal(count(1), 8);
    assert.equal(count(2), 16);
    assert.equal(count(3), 24);
    assert.ok(biteMask(3)?.endsWith("linear-gradient(#000, #000)"));
  });
  it("la capa interior (rim) usa agujeros más chicos", () => {
    const [outer] = biteCircles(BITES[0]);
    const [inner] = biteCircles(BITES[0], 2.6);
    assert.ok(inner.r < outer.r);
  });
  it("los dientes se superponen con el núcleo (sin islas sueltas)", () => {
    for (const spec of BITES) {
      const [core, ...teeth] = biteCircles(spec);
      for (const t of teeth) assert.ok(Math.hypot(t.x - core.x, t.y - core.y) < core.r + t.r);
    }
  });
  it("la tercera mordida es la más grande (casi terminada)", () => {
    assert.ok(BITES[2].radius > BITES[0].radius && BITES[2].radius > BITES[1].radius);
  });
  it("las miguitas salen desde adentro de la cookie", () => {
    for (let i = 0; i < BITE_COUNT; i++) {
      const { x, y } = bitePoint(i);
      assert.ok(Math.hypot(x - 50, y - 50) <= 50);
    }
  });
});
