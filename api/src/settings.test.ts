import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeInstagramHandle, normalizeWhatsAppNumber, validateSettingsInput } from "./settings.ts";
import { hasAdminRole } from "./auth.ts";
import { parseOrigins } from "./env.ts";

describe("normalizeWhatsAppNumber", () => {
  it("deja solo dígitos y valida largo", () => {
    assert.equal(normalizeWhatsAppNumber("+54 9 (358) 412-3456"), "5493584123456");
    assert.equal(normalizeWhatsAppNumber("0054 9 358 4123456"), "5493584123456");
    assert.equal(normalizeWhatsAppNumber("1234567"), null);
    assert.equal(normalizeWhatsAppNumber("1234567890123456"), null);
    assert.equal(normalizeWhatsAppNumber("0351 4123456"), null);
  });
});

describe("normalizeInstagramHandle", () => {
  it("acepta @usuario, usuario y URL", () => {
    assert.equal(normalizeInstagramHandle("@Sweet.Cookies.Rio4"), "@sweet.cookies.rio4");
    assert.equal(normalizeInstagramHandle("sweet.cookies.rio4"), "@sweet.cookies.rio4");
    assert.equal(normalizeInstagramHandle("https://www.instagram.com/sweet.cookies.rio4/"), "@sweet.cookies.rio4");
  });
  it("rechaza caracteres inválidos", () => {
    assert.equal(normalizeInstagramHandle("<script>"), null);
    assert.equal(normalizeInstagramHandle("hola mundo"), null);
  });
});

describe("validateSettingsInput", () => {
  it("normaliza un body válido e ignora campos extra", () => {
    const result = validateSettingsInput({
      whatsappNumber: "+54 9 358 412-3456",
      instagramHandle: "sweet.cookies.rio4",
      whatsappOrdersEnabled: false,
      id: "hack",
      updatedBy: "x",
    });
    assert.deepEqual(result, {
      ok: true,
      data: { whatsappNumber: "5493584123456", instagramHandle: "@sweet.cookies.rio4", whatsappOrdersEnabled: false },
    });
  });
  it("permite vaciar número e Instagram", () => {
    const result = validateSettingsInput({ whatsappNumber: "", instagramHandle: null, whatsappOrdersEnabled: true });
    assert.deepEqual(result, { ok: true, data: { whatsappNumber: null, instagramHandle: null, whatsappOrdersEnabled: true } });
  });
  it("devuelve errores por campo", () => {
    const result = validateSettingsInput({ whatsappNumber: "123", instagramHandle: "a b", whatsappOrdersEnabled: "yes" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(Object.keys(result.errors).sort(), ["instagramHandle", "whatsappNumber", "whatsappOrdersEnabled"]);
  });
  it("rechaza bodies que no son objetos", () => {
    assert.equal(validateSettingsInput(null).ok, false);
    assert.equal(validateSettingsInput([1]).ok, false);
    assert.equal(validateSettingsInput({ whatsappNumber: 5493584123456, whatsappOrdersEnabled: true }).ok, false);
  });
});

describe("hasAdminRole / parseOrigins", () => {
  it("solo role === 'admin' en publicMetadata", () => {
    assert.equal(hasAdminRole({ role: "admin" }), true);
    assert.equal(hasAdminRole({ role: "Admin" }), false);
    assert.equal(hasAdminRole({}), false);
    assert.equal(hasAdminRole(null), false);
  });
  it("filtra orígenes inválidos y barras finales", () => {
    assert.deepEqual(parseOrigins(" https://a.vercel.app/ ,http://localhost:3000,*, nope"), [
      "https://a.vercel.app",
      "http://localhost:3000",
    ]);
  });
});
