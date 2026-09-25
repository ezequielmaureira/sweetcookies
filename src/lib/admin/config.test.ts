import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedAdmin, parseAdminEmails } from "./config.ts";

// Emails de ejemplo: los reales viven solo en la variable ADMIN_EMAILS.
const verified = (emailAddress: string) => ({ emailAddress, verification: { status: "verified" } });
const unverified = (emailAddress: string) => ({ emailAddress, verification: { status: "unverified" } });

describe("parseAdminEmails", () => {
  it("normaliza trim + lowercase e ignora vacíos", () => {
    assert.deepEqual([...parseAdminEmails("  Ana@Example.com , ,beto@example.com,, ")], ["ana@example.com", "beto@example.com"]);
  });
  it("vacío o ausente → allowlist vacía", () => {
    assert.equal(parseAdminEmails("").size, 0);
    assert.equal(parseAdminEmails(undefined).size, 0);
    assert.equal(parseAdminEmails(" , ").size, 0);
  });
});

describe("isAllowedAdmin", () => {
  const allowlist = parseAdminEmails("ana@example.com, beto@example.com");
  it("admite a cada email de la lista", () => {
    assert.equal(isAllowedAdmin([verified("ana@example.com")], allowlist), true);
    assert.equal(isAllowedAdmin([verified("beto@example.com")], allowlist), true);
  });
  it("compara sin importar mayúsculas", () => {
    assert.equal(isAllowedAdmin([verified("ANA@Example.COM")], allowlist), true);
  });
  it("rechaza otros emails, parecidos y no verificados", () => {
    assert.equal(isAllowedAdmin([verified("otro@example.com")], allowlist), false);
    assert.equal(isAllowedAdmin([verified("ana@example.com.ar")], allowlist), false);
    assert.equal(isAllowedAdmin([verified("xana@example.com")], allowlist), false);
    assert.equal(isAllowedAdmin([unverified("ana@example.com")], allowlist), false);
    assert.equal(isAllowedAdmin([], allowlist), false);
  });
  it("allowlist vacía → nadie entra", () => {
    assert.equal(isAllowedAdmin([verified("ana@example.com")], parseAdminEmails("")), false);
  });
});
