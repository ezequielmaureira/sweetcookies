import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractVoucherPublicId, normalizeVoucherCode } from "./voucher-scan.ts";

const PROD = "https://sweetcookies-seven.vercel.app";
const DEV = "http://192.168.0.10:3000";
const ID = "d8f7sd8f7sd8f7AB";

describe("escáner: qué QR se aceptan", () => {
  it("extrae el publicId de un QR de Sweet Cookies (producción o base de desarrollo)", () => {
    assert.equal(extractVoucherPublicId(`${PROD}/v/${ID}`, [PROD, DEV]), ID);
    assert.equal(extractVoucherPublicId(`${PROD}/v/${ID}/`, [PROD, DEV]), ID);
    assert.equal(extractVoucherPublicId(`  ${DEV}/v/${ID}  `, [PROD, DEV]), ID);
  });

  it("rechaza QR externos, textos y URLs que imitan el dominio", () => {
    for (const text of [
      "Caja de 6 cookies",
      `https://otra-web.com/v/${ID}`,
      `https://sweetcookies-seven.vercel.app.evil.com/v/${ID}`,
      `http://sweetcookies-seven.vercel.app/v/${ID}`,
      `${PROD}/v/corto`,
      `${PROD}/admin/vouchers/${ID}`,
      `${PROD}/v/${ID}/extra`,
      `https://user:pass@sweetcookies-seven.vercel.app/v/${ID}`,
      `${DEV}/v/${ID}`,
      "javascript:alert(1)",
    ]) {
      assert.equal(extractVoucherPublicId(text, [PROD]), null, text);
    }
  });
});

describe("escáner: código manual", () => {
  it("con o sin SC-, mayúsculas o minúsculas → mismo código", () => {
    for (const raw of ["SC-8K4P2M", "8K4P2M", "sc-8k4p2m", " sc 8k4p2m ", "SC8K4P2M"]) assert.equal(normalizeVoucherCode(raw), "SC-8K4P2M", raw);
  });

  it("rechaza lo que no puede ser un código", () => {
    for (const raw of ["", "SC-", "8K4P2", "8K4P2MX", "SC-8K4P20", "hola mundo"]) assert.equal(normalizeVoucherCode(raw), null, raw);
  });
});
