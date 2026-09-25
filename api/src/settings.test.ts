import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeInstagramHandle, normalizeWhatsAppNumber, validateSettingsInput } from "./settings.ts";
import { createClerkAuth, isAllowedAdmin, parseAdminEmails } from "./auth.ts";
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

describe("ADMIN_EMAILS", () => {
  // Emails de ejemplo: los reales viven solo en la variable ADMIN_EMAILS.
  const verified = (emailAddress: string) => ({ emailAddress, verification: { status: "verified" } });
  const allowlist = parseAdminEmails("  Ana@Example.com , ,beto@example.com ");

  it("normaliza trim + lowercase e ignora vacíos", () => {
    assert.deepEqual([...allowlist], ["ana@example.com", "beto@example.com"]);
    assert.equal(parseAdminEmails("").size, 0);
    assert.equal(parseAdminEmails(undefined).size, 0);
  });
  it("admite solo emails verificados de la lista (sin importar mayúsculas)", () => {
    assert.equal(isAllowedAdmin({ emailAddresses: [verified("ANA@example.com")] }, allowlist), true);
    assert.equal(isAllowedAdmin({ emailAddresses: [verified("beto@example.com")] }, allowlist), true);
    assert.equal(isAllowedAdmin({ emailAddresses: [verified("otro@example.com")] }, allowlist), false);
    assert.equal(isAllowedAdmin({ emailAddresses: [verified("ana@example.com.ar")] }, allowlist), false);
    assert.equal(
      isAllowedAdmin({ emailAddresses: [{ emailAddress: "ana@example.com", verification: { status: "unverified" } }] }, allowlist),
      false,
    );
  });
  it("allowlist vacía → nadie es admin", () => {
    assert.equal(isAllowedAdmin({ emailAddresses: [verified("ana@example.com")] }, parseAdminEmails(" , ")), false);
  });
  it("publicMetadata.role = admin no alcanza si el email no está en la lista", async () => {
    const auth = createClerkAuth({
      secretKey: "sk_test_dummy",
      publishableKey: "pk_test_ZHVtbXkuY2xlcmsuYWNjb3VudHMuZGV2JA",
      authorizedParties: [],
      adminEmails: allowlist,
      getUser: async (id) =>
        ({
          emailAddresses: [verified(id === "u_ana" ? "ana@example.com" : "intruso@example.com")],
          publicMetadata: { role: "admin" },
        }) as never,
    });
    assert.equal(await auth.isAdmin("u_intruso"), false);
    assert.equal(await auth.isAdmin("u_ana"), true);
  });
});

describe("parseOrigins", () => {
  it("filtra orígenes inválidos y barras finales", () => {
    assert.deepEqual(parseOrigins(" https://a.vercel.app/ ,http://localhost:3000,*, nope"), [
      "https://a.vercel.app",
      "http://localhost:3000",
    ]);
  });
});
