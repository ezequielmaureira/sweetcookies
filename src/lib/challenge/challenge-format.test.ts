import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attemptsText, challengePhase, formatCountdown, formatCordobaDateTime, instagramUrl } from "./challenge-format.ts";

describe("textos del campeonato", () => {
  it("cuenta regresiva con días o con reloj", () => {
    assert.equal(formatCountdown(0), "00:00:00");
    assert.equal(formatCountdown(-5000), "00:00:00");
    assert.equal(formatCountdown(3_723_000), "01:02:03");
    assert.equal(formatCountdown(2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000), "2 d 04 h 12 min");
  });

  it("intentos oficiales del torneo en singular y plural", () => {
    assert.equal(attemptsText(3), "Te quedan 3 intentos oficiales");
    assert.equal(attemptsText(1), "Te queda 1 intento oficial");
  });

  it("sábado de revisión y domingo cerrado", () => {
    const edition = { status: "FINISHED", reviewEndsAt: "2026-10-25T02:59:59.999Z" };
    assert.equal(challengePhase(edition, Date.parse("2026-10-24T15:00:00Z")), "review"); // sábado
    assert.equal(challengePhase(edition, Date.parse("2026-10-25T15:00:00Z")), "closed"); // domingo
    assert.equal(challengePhase({ ...edition, status: "RESULTS_PUBLISHED" }, Date.parse("2026-10-24T20:00:00Z")), "review");
    assert.equal(challengePhase({ ...edition, status: "ACTIVE" }, null), "competition");
  });

  it("enlace al Instagram oficial desde el @ configurado", () => {
    assert.equal(instagramUrl("@sweet.cookies.rio4"), "https://www.instagram.com/sweet.cookies.rio4/");
  });

  it("las fechas se muestran en hora de Córdoba", () => {
    // Sábado 02:59:59 UTC = viernes 23:59:59 en Córdoba.
    assert.match(formatCordobaDateTime("2026-10-24T02:59:59.999Z"), /viernes.*23:59/);
  });
});
