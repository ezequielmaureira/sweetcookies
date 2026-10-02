import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boxLabel,
  formatVoucherDate,
  formatVoucherDateTime,
  isValidPublicId,
  todayInArgentina,
  voucherMailtoUrl,
  voucherShareText,
  voucherUrl,
  voucherWhatsAppUrl,
} from "./voucher-format.ts";

describe("voucher-format", () => {
  it("fechas en hora de Argentina", () => {
    // Fin del 15/10 en Argentina = 16/10 02:59 UTC: se sigue mostrando 15/10.
    assert.equal(formatVoucherDate("2026-10-16T02:59:59.999Z"), "15/10/2026");
    assert.equal(formatVoucherDateTime("2026-10-01T21:05:00Z"), "01/10/2026 18:05");
    assert.equal(todayInArgentina(new Date("2026-10-02T01:00:00Z")), "2026-10-01");
  });

  it("URL del QR y textos", () => {
    assert.equal(voucherUrl("d8f7sd8f7sd8f7AB"), "https://sweetcookies-seven.vercel.app/v/d8f7sd8f7sd8f7AB");
    assert.equal(voucherUrl("abc", "http://192.168.0.10:3000"), "http://192.168.0.10:3000/v/abc");
    assert.equal(boxLabel(6), "Caja de 6 cookies");
    assert.ok(isValidPublicId("d8f7sd8f7sd8f7AB"));
    assert.ok(!isValidPublicId("../admin"));
  });

  it("textos para compartir: solo el link, sin imágenes", () => {
    const v = { publicId: "d8f7sd8f7sd8f7AB", cookieQuantity: 6, expiresAt: "2026-10-16T02:59:59.999Z" };
    const url = "https://sweetcookies-seven.vercel.app/v/d8f7sd8f7sd8f7AB";
    assert.equal(voucherShareText(v), `Tenés un voucher de Sweet Cookies 🍪\n\nCaja de 6 cookies\nVálido hasta 15/10/2026\n\n${url}`);
  });

  it("WhatsApp y email: mensaje con el link, sin destinatario ni adjuntos", () => {
    const v = { publicId: "d8f7sd8f7sd8f7AB", cookieQuantity: 4, expiresAt: "2026-10-16T02:59:59.999Z" };
    const url = "https://sweetcookies-seven.vercel.app/v/d8f7sd8f7sd8f7AB";
    const wa = new URL(voucherWhatsAppUrl(v));
    assert.equal(wa.origin + wa.pathname, "https://wa.me/");
    assert.equal(wa.searchParams.get("text"), `Tenés un voucher de Sweet Cookies 🍪\n\nCaja de 4 cookies\nVálido hasta 15/10/2026\n\nAbrí tu voucher acá:\n${url}`);

    const mail = voucherMailtoUrl(v);
    assert.ok(mail.startsWith("mailto:?subject="));
    const params = new URLSearchParams(mail.slice("mailto:?".length));
    assert.equal(params.get("subject"), "Tenés un voucher de Sweet Cookies 🍪");
    assert.equal(params.get("body"), `Tenés un voucher de Sweet Cookies.\n\nCaja de 4 cookies\nVálido hasta 15/10/2026\n\nVoucher:\n${url}\n\nImagen del voucher:\n${url}/image`);
  });

  it("copiar link: la URL del voucher según el entorno", () => {
    assert.equal(voucherUrl("d8f7sd8f7sd8f7AB"), "https://sweetcookies-seven.vercel.app/v/d8f7sd8f7sd8f7AB");
    assert.equal(voucherUrl("d8f7sd8f7sd8f7AB", "http://192.168.0.10:3000"), "http://192.168.0.10:3000/v/d8f7sd8f7sd8f7AB");
  });
});
