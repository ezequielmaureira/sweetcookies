import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GAME_DURATION_MS, MIN_TAP_INTERVAL_MS, cookiesEaten, createTapCounter, formatTimer, scoreTaps } from "./scoring.ts";

describe("contador de mordidas", () => {
  it("cada toque válido es una mordida", () => {
    assert.deepEqual(scoreTaps([0, 100, 200, 300]), { bites: 4, ignored: 0 });
  });

  it("ignora toques demasiado juntos (rebotes)", () => {
    assert.deepEqual(scoreTaps([0, MIN_TAP_INTERVAL_MS - 1, MIN_TAP_INTERVAL_MS]), { bites: 2, ignored: 1 });
  });

  it("solo cuenta dentro de los 15 segundos", () => {
    assert.deepEqual(scoreTaps([-1, 0, GAME_DURATION_MS - 1, GAME_DURATION_MS, GAME_DURATION_MS + 500]), { bites: 2, ignored: 3 });
  });

  it("ignora tiempos inválidos o que van hacia atrás", () => {
    assert.deepEqual(scoreTaps([500, 400, Number.NaN, Number.POSITIVE_INFINITY]), { bites: 1, ignored: 3 });
  });

  it("nunca cuenta más de 20 por segundo, aunque se toque más rápido", () => {
    // Un toque cada 40 ms durante toda la partida (25 por segundo).
    const taps = Array.from({ length: GAME_DURATION_MS / 40 }, (_, i) => i * 40);
    assert.equal(scoreTaps(taps).bites, 300);
  });

  it("el contador en vivo y el cálculo sobre la lista coinciden", () => {
    const taps = [0, 30, 95, 180, 181, 260, 900, 14_999];
    const live = createTapCounter();
    taps.forEach((t) => live.tap(t));
    assert.deepEqual({ bites: live.bites, ignored: live.ignored }, scoreTaps(taps));
  });
});

describe("cookies comidas", () => {
  it("30 mordidas = 1 cookie", () => {
    assert.equal(cookiesEaten(0), 0);
    assert.equal(cookiesEaten(29), 0);
    assert.equal(cookiesEaten(30), 1);
    assert.equal(cookiesEaten(125), 4);
  });
});

describe("cronómetro", () => {
  it("muestra décimas con coma, redondeando hacia arriba", () => {
    assert.equal(formatTimer(15_000), "15,0");
    assert.equal(formatTimer(14_901), "15,0");
    assert.equal(formatTimer(14_900), "14,9");
    assert.equal(formatTimer(4_210), "4,3");
    assert.equal(formatTimer(1), "0,1");
    assert.equal(formatTimer(0), "0,0");
    assert.equal(formatTimer(-250), "0,0");
  });
});
