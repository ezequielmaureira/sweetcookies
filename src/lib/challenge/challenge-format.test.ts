import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attemptsText, challengeLink, firstName, formatCountdown, formatCordobaDateTime, instagramUrl, readLinkParams, shareMessage, whatsappChatUrl, whatsappShareUrl, winnerMessage } from "./challenge-format.ts";

describe("textos del campeonato", () => {
  it("cuenta regresiva con días o con reloj", () => {
    assert.equal(formatCountdown(0), "00:00:00");
    assert.equal(formatCountdown(-5000), "00:00:00");
    assert.equal(formatCountdown(3_723_000), "01:02:03");
    assert.equal(formatCountdown(2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000), "2 d 04 h 12 min");
  });

  it("intentos del torneo según su configuración (X de Y)", () => {
    assert.equal(attemptsText(5, 5), "Te quedan 5 de 5 intentos en este torneo");
    assert.equal(attemptsText(1, 10), "Te queda 1 de 10 intentos en este torneo");
  });

  it("enlace al Instagram oficial desde el @ configurado", () => {
    assert.equal(instagramUrl("@sweet.cookies.rio4"), "https://www.instagram.com/sweet.cookies.rio4/");
  });

  it("las fechas se muestran en hora de Córdoba", () => {
    // Sábado 02:59:59 UTC = viernes 23:59:59 en Córdoba.
    assert.match(formatCordobaDateTime("2026-10-24T02:59:59.999Z"), /viernes.*23:59/);
  });

  const base = { tournamentName: "Desafío Halloween", prize: "Caja de 6 cookies", isTest: false, url: "https://sweetcookies-seven.vercel.app/campeonato?torneo=t1&ref=abcdefghjk" };

  it("mensaje antes de jugar: premio real y enlace", () => {
    const text = shareMessage({ ...base, kind: "invite", score: null });
    assert.ok(text.startsWith("🍪 ¡Te desafío a participar en Sweet Click Challenge!"));
    assert.ok(text.includes("🏆 Premio: Caja de 6 cookies"));
    assert.ok(text.includes("Tenés 15 segundos para conseguir la mayor cantidad de mordidas."));
    assert.ok(text.endsWith(`👉 ${base.url}`));
  });

  it("mensaje después de jugar: el puntaje validado; sin puntaje no inventa uno", () => {
    const text = shareMessage({ ...base, kind: "record", score: 87 });
    assert.ok(text.includes("Conseguí 87 mordidas en Sweet Click Challenge."));
    assert.ok(text.includes("¿Podés superarme en 15 segundos?"));
    assert.equal(shareMessage({ ...base, kind: "record", score: 1 }).includes("Conseguí 1 mordida "), true);
    const noScore = shareMessage({ ...base, kind: "record", score: null });
    assert.ok(!/Conseguí/.test(noScore) && noScore.includes("Te desafío a participar"));
  });

  it("mensaje de torneo terminado", () => {
    const text = shareMessage({ ...base, kind: "finished", score: null });
    assert.ok(text.startsWith("🏆 ¡Mirá cómo terminó Sweet Click Challenge!"));
    assert.ok(text.includes("Desafío: Desafío Halloween"));
  });

  it("torneo de prueba: nunca presenta el premio como real", () => {
    for (const kind of ["invite", "record", "finished"] as const) {
      const text = shareMessage({ ...base, isTest: true, kind, score: 40 });
      assert.ok(!text.includes("Premio: Caja de 6 cookies"), kind);
    }
    assert.ok(shareMessage({ ...base, isTest: true, kind: "invite", score: null }).includes("torneo de prueba: no hay premio real"));
  });

  it("WhatsApp recibe el mensaje completo y codificado", () => {
    const text = shareMessage({ ...base, kind: "record", score: 87 });
    const url = whatsappShareUrl(text);
    assert.ok(url.startsWith("https://wa.me/?text="));
    assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), text);
  });

  it("enlace personal: torneo + código público, sin datos privados", () => {
    assert.equal(challengeLink("https://sweetcookies-seven.vercel.app", "t1", "abcdefghjk"), "https://sweetcookies-seven.vercel.app/campeonato?torneo=t1&ref=abcdefghjk");
    assert.equal(challengeLink("https://sweetcookies-seven.vercel.app", "t1", null), "https://sweetcookies-seven.vercel.app/campeonato?torneo=t1");
  });

  it("parámetros del enlace: se validan y lo inválido se ignora", () => {
    assert.deepEqual(readLinkParams("?torneo=cmvjvvq670000hksn8d6dgc8p&ref=abcdefghjk"), { tournamentId: "cmvjvvq670000hksn8d6dgc8p", ref: "abcdefghjk" });
    assert.deepEqual(readLinkParams("?torneo=<script>&ref=ABC"), { tournamentId: null, ref: null });
    assert.deepEqual(readLinkParams(""), { tournamentId: null, ref: null });
  });
});

describe("enlace público del torneo y contacto con el ganador", () => {
  it("el enlace que copia el admin es permanente y no lleva códigos de invitación", () => {
    const url = challengeLink("https://sweetcookies-seven.vercel.app", "cmvjvvq670000hksn8d6dgc8p", null);
    assert.equal(url, "https://sweetcookies-seven.vercel.app/campeonato?torneo=cmvjvvq670000hksn8d6dgc8p");
    assert.ok(!url.includes("ref="));
    assert.deepEqual(readLinkParams(new URL(url).search), { tournamentId: "cmvjvvq670000hksn8d6dgc8p", ref: null });
  });

  it("mensaje preparado para el ganador, con su nombre, el torneo y el premio", () => {
    const text = winnerMessage({ name: "Ana Pérez", tournamentName: "Desafío Halloween", prize: "Caja de 6 cookies" });
    assert.equal(
      text,
      [
        "¡Hola, Ana! 🍪🏆",
        "",
        "Te contactamos desde Sweet Cookies porque resultaste ganador del torneo Desafío Halloween.",
        "",
        "Tu premio es: Caja de 6 cookies.",
        "",
        "Queremos coordinar con vos la verificación de tus datos y la entrega.",
        "",
        "¡Felicitaciones!",
      ].join("\n"),
    );
    assert.equal(firstName("  María José  Gómez"), "María");
  });

  it("abre el chat con el número del ganador y el mensaje listo (no se envía solo)", () => {
    const url = whatsappChatUrl("5493584123456", "¡Hola, Ana! 🍪");
    assert.ok(url.startsWith("https://wa.me/5493584123456?text="));
    assert.equal(decodeURIComponent(url.split("text=")[1]), "¡Hola, Ana! 🍪");
  });
});
