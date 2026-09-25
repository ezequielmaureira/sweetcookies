import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOrderMessage, buildWhatsAppUrl, normalizeWhatsAppNumber } from "./whatsapp.ts";
import { validateOrder, type CustomerDetails } from "./order.ts";

const customer: CustomerDetails = { name: "Ezequiel", phone: "", method: "retiro", address: "", notes: "" };

describe("normalizeWhatsAppNumber", () => {
  it("deja solo dígitos", () => {
    assert.equal(normalizeWhatsAppNumber("+54 9 (358) 412-3456"), "5493584123456");
  });
  it("quita el prefijo internacional 00", () => {
    assert.equal(normalizeWhatsAppNumber("005493584123456"), "5493584123456");
  });
  it("rechaza vacíos o inválidos", () => {
    assert.equal(normalizeWhatsAppNumber(""), null);
    assert.equal(normalizeWhatsAppNumber(undefined), null);
    assert.equal(normalizeWhatsAppNumber("abc"), null);
    assert.equal(normalizeWhatsAppNumber("1234"), null);
    assert.equal(normalizeWhatsAppNumber("1234567890123456"), null);
  });
});

describe("buildOrderMessage", () => {
  it("arma el mensaje con retiro y observaciones multilínea", () => {
    const message = buildOrderMessage(
      [
        { name: "Pistacho", quantity: 2 },
        { name: "Limón & Frambuesa", quantity: 1 },
      ],
      { ...customer, notes: "Paso a las 18:30.\n\n\n\nGracias   ☺" },
    );
    assert.equal(
      message,
      [
        "🍪 NUEVO PEDIDO — SWEET COOKIES",
        "",
        "Hola! Quiero hacer este pedido:",
        "",
        "2 × Pistacho",
        "1 × Limón & Frambuesa",
        "",
        "Total: 3 cookies",
        "",
        "Nombre: Ezequiel",
        "Modalidad: Retiro",
        "",
        "Observaciones:",
        "Paso a las 18:30.",
        "",
        "Gracias ☺",
        "",
        "Gracias!",
      ].join("\n"),
    );
  });

  it("incluye teléfono y dirección cuando es envío", () => {
    const message = buildOrderMessage([{ name: "Chocotorta", quantity: 1 }], {
      ...customer,
      phone: " 358 412 3456 ",
      method: "envio",
      address: "  Calle Falsa 123 ",
    });
    assert.match(message, /Total: 1 cookie\n/);
    assert.match(message, /Teléfono: 358 412 3456\nModalidad: Envío\nDirección: Calle Falsa 123\n/);
    assert.doesNotMatch(message, /Observaciones/);
  });
});

describe("buildWhatsAppUrl", () => {
  it("encodea caracteres especiales y saltos de línea", () => {
    const url = buildWhatsAppUrl("5490000000000", "1 × Limón & Frambuesa\n¿Ñandú? #1 🍪");
    assert.ok(url.startsWith("https://wa.me/5490000000000?text="));
    assert.ok(!url.includes("&F"), "el & del sabor no debe cortar el query string");
    assert.ok(url.includes("%26"));
    assert.ok(url.includes("%0A"));
    const text = new URL(url).searchParams.get("text");
    assert.equal(text, "1 × Limón & Frambuesa\n¿Ñandú? #1 🍪");
  });
});

describe("validateOrder", () => {
  it("exige carrito, nombre, modalidad y número", () => {
    const result = validateOrder({
      customer: { ...customer, name: " ", method: "" },
      totalCount: 0,
      hasWhatsAppNumber: false,
    });
    assert.equal(result.isValid, false);
    assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["method", "name"]);
    assert.deepEqual(result.issues, ["empty-cart", "missing-whatsapp-number"]);
  });
  it("exige dirección solo para envío", () => {
    const envio = validateOrder({ customer: { ...customer, method: "envio" }, totalCount: 2, hasWhatsAppNumber: true });
    assert.ok(envio.fieldErrors.address);
    const retiro = validateOrder({ customer, totalCount: 2, hasWhatsAppNumber: true });
    assert.equal(retiro.isValid, true);
  });
});
