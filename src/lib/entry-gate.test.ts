import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENTRY_STORAGE_KEY, entryScript, hasEntered, markEntered } from "./entry-gate.ts";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const broken = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("entrada al sitio", () => {
  it("una sesión nueva todavía no entró", () => {
    assert.equal(hasEntered(memoryStorage()), false);
  });
  it("después de la cookie queda marcada la sesión", () => {
    const storage = memoryStorage();
    markEntered(storage);
    assert.equal(storage.getItem(ENTRY_STORAGE_KEY), "true");
    assert.equal(hasEntered(storage), true);
  });
  it("sin sessionStorage (o si lanza) no rompe y muestra la entrada", () => {
    assert.equal(hasEntered(null), false);
    assert.equal(hasEntered(broken), false);
    assert.doesNotThrow(() => markEntered(broken));
  });
  it("el script de <head> usa la misma clave", () => {
    assert.ok(entryScript.includes(JSON.stringify(ENTRY_STORAGE_KEY)));
  });
});
