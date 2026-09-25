import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moneyToInput, normalizeMoneyInput } from "./money-input.ts";

describe("normalizeMoneyInput", () => {
  it("acepta formato argentino y con punto decimal", () => {
    assert.equal(normalizeMoneyInput("5000"), "5000.00");
    assert.equal(normalizeMoneyInput("5.000"), "5000.00");
    assert.equal(normalizeMoneyInput("$ 5.000,50"), "5000.50");
    assert.equal(normalizeMoneyInput("5000,5"), "5000.50");
    assert.equal(normalizeMoneyInput("5000.50"), "5000.50");
    assert.equal(normalizeMoneyInput("1.234.567"), "1234567.00");
    assert.equal(normalizeMoneyInput("0"), "0.00");
  });
  it("rechaza lo que no es un importe", () => {
    for (const bad of ["", "abc", "-5", "5,555", "5.5.5", "12,3,4"]) assert.equal(normalizeMoneyInput(bad), null, bad);
  });
});

describe("moneyToInput", () => {
  it("muestra el importe para editar", () => {
    assert.equal(moneyToInput("5000.00"), "5000");
    assert.equal(moneyToInput("5000.50"), "5000,50");
  });
});
