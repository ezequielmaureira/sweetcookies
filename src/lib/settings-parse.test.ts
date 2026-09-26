import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { instagramUrl, parsePublicSettings } from "./settings-parse.ts";

describe("parsePublicSettings", () => {
  it("acepta la respuesta de la API", () => {
    assert.deepEqual(
      parsePublicSettings({ whatsappNumber: "5493584123456", instagramHandle: "@sweet.cookies.rio4", ordersEnabled: true, extra: 1 }),
      { whatsappNumber: "5493584123456", instagramHandle: "@sweet.cookies.rio4", ordersEnabled: true, ordersDisabledMessage: null },
    );
  });
  it("pedidos pausados con mensaje del negocio", () => {
    assert.deepEqual(parsePublicSettings({ whatsappNumber: null, instagramHandle: null, ordersEnabled: false, ordersDisabledMessage: "  De vacaciones hasta el 15.  " }), {
      whatsappNumber: null,
      instagramHandle: null,
      ordersEnabled: false,
      ordersDisabledMessage: "De vacaciones hasta el 15.",
    });
  });
  it("acepta el nombre anterior del interruptor (API sin actualizar)", () => {
    assert.equal(parsePublicSettings({ whatsappNumber: null, instagramHandle: null, whatsappOrdersEnabled: false })?.ordersEnabled, false);
  });
  it("descarta número o Instagram inválidos", () => {
    assert.deepEqual(parsePublicSettings({ whatsappNumber: "12", instagramHandle: "<b>", ordersEnabled: false }), {
      whatsappNumber: null,
      instagramHandle: null,
      ordersEnabled: false,
      ordersDisabledMessage: null,
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
