import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { instagramUrl, parsePublicSettings } from "./settings-parse.ts";

describe("parsePublicSettings", () => {
  it("acepta la respuesta de la API", () => {
    assert.deepEqual(
      parsePublicSettings({ whatsappNumber: "5493584123456", instagramHandle: "@sweet.cookies.rio4", whatsappOrdersEnabled: true, extra: 1 }),
      { whatsappNumber: "5493584123456", instagramHandle: "@sweet.cookies.rio4", whatsappOrdersEnabled: true },
    );
  });
  it("descarta número o Instagram inválidos", () => {
    assert.deepEqual(parsePublicSettings({ whatsappNumber: "12", instagramHandle: "<b>", whatsappOrdersEnabled: false }), {
      whatsappNumber: null,
      instagramHandle: null,
      whatsappOrdersEnabled: false,
    });
  });
  it("respuesta rota → null (usar respaldo)", () => {
    assert.equal(parsePublicSettings(null), null);
    assert.equal(parsePublicSettings({ whatsappNumber: "5493584123456" }), null);
    assert.equal(parsePublicSettings("hola"), null);
  });
  it("arma la URL de Instagram", () => {
    assert.equal(instagramUrl("@sweet.cookies.rio4"), "https://www.instagram.com/sweet.cookies.rio4/");
  });
});
