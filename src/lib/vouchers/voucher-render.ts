/**
 * Dibuja el voucher en un <canvas>. Es la ÚNICA fuente del diseño: la vista
 * online, la imagen PNG (/v/<publicId>/image) y el archivo que se comparte
 * salen de esta misma función, con el mismo QR y el mismo código.
 *
 * Base: el arte original del voucher (marco vintage, cookies, títulos y la
 * franja "CAJA DE 4/6 COOKIES"), recortado de la referencia en
 * public/images/vouchers. Encima se dibuja solo lo dinámico, en los dos
 * espacios libres de las esquinas inferiores:
 *   - izquierda: sello "Válido hasta DD/MM/AAAA"
 *   - derecha: QR (cuadrado blanco mínimo) + código, sin tapar cookies.
 * Coordenadas en unidades del arte original (1536 × 511).
 */
import QRCode from "qrcode";
import { formatVoucherDate, voucherUrl } from "./voucher-format";

export const VOUCHER_WIDTH = 1536;
export const VOUCHER_HEIGHT = 511;
/** 2×: 3072 × 1022 px, nítido en pantallas de alta densidad. */
export const VOUCHER_SCALE = 2;

export type VoucherArt = { cookieQuantity: number; expiresAt: string; code: string; publicId: string };

const BACKGROUNDS: Record<number, string> = {
  4: "/images/vouchers/voucher-caja-4.jpg",
  6: "/images/vouchers/voucher-caja-6.jpg",
};

/* Paleta tomada del arte: tinta marrón. Sin fondos propios: todo va impreso sobre el beige. */
const INK = "#3b291e";
const INK_SOFT = "#5b4535";
const QR_DARK = "#1f150f";
const QR_LIGHT = "#ffffff";

/**
 * QR en el hueco libre de la esquina inferior derecha: entre la cookie de chips
 * (termina en x≈1381), la de dulce de leche (termina en y≈368) y el marco (x≈1501).
 * Solo el cuadrado blanco mínimo (QR + 2 módulos); el beige claro alrededor
 * completa la zona de silencio sin tapar ninguna cookie.
 */
const QR_AREA = { x: 1392, y: 374, size: 93 };
const QR_QUIET_MODULES = 2;
/** Código SC-XXXXXX debajo del QR, apenas corrido a la izquierda para no tocar la curva de la esquina del marco. */
const QR_CODE = { baseline: 479, centerX: 1435.5 };
/** Sello de la fecha (esquina inferior izquierda, simétrico al QR). */
const DATE_TAG = { x: 40, y: 394, w: 128, h: 84 };

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(src);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(src);
        reject(new Error(`No se pudo cargar ${src}`));
      };
      img.src = src;
    });
    imageCache.set(src, cached);
  }
  return cached;
}

/**
 * Espera la fuente web (si no, el canvas dibujaría con la de respaldo).
 * Solo se carga la PRIMERA familia: next/font agrega una de respaldo
 * ("… Fallback", src: local(Times New Roman)) que no existe en muchos celulares,
 * y document.fonts.load() rechaza todo si cualquier fuente de la lista falla.
 * Si aun así la fuente no carga, el voucher se dibuja igual con la de respaldo.
 */
async function ensureFonts(family: string) {
  const primary = family.split(",")[0].trim();
  await Promise.allSettled([document.fonts.load(`400 16px ${primary}`), document.fonts.load(`700 16px ${primary}`)]);
}

function setSpacing(ctx: CanvasRenderingContext2D, value: string) {
  // letterSpacing no existe en navegadores viejos: sin él, el texto queda igual de legible.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}

/** Doble filete como el marco del voucher, sin relleno: se ve el beige original. */
function vintageFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4, radius);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, w - 8, h - 8, Math.max(0, radius - 3));
  ctx.stroke();
}

/** Adorno "— • ● • —" igual al del pie del voucher. */
function ornament(ctx: CanvasRenderingContext2D, cx: number, cy: number, half: number) {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - half, cy);
  ctx.lineTo(cx - 9, cy);
  ctx.moveTo(cx + 9, cy);
  ctx.lineTo(cx + half, cy);
  ctx.stroke();
  for (const [dx, r] of [[-5.5, 1.3], [0, 2.1], [5.5, 1.3]] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDateTag(ctx: CanvasRenderingContext2D, expiresAt: string, family: string) {
  const { x, y, w, h } = DATE_TAG;
  vintageFrame(ctx, x, y, w, h, 10);
  const cx = x + w / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK_SOFT;
  ctx.font = `700 11.5px ${family}`;
  setSpacing(ctx, "1.6px");
  ctx.fillText("VÁLIDO HASTA", cx + 0.8, y + 27);
  ornament(ctx, cx, y + 39, 40);
  ctx.fillStyle = INK;
  ctx.font = `700 20px ${family}`;
  setSpacing(ctx, "0.4px");
  ctx.fillText(formatVoucherDate(expiresAt), cx, y + 66);
  setSpacing(ctx, "0px");
}

function drawQr(ctx: CanvasRenderingContext2D, art: VoucherArt, family: string, scale: number) {
  const { x, y, size } = QR_AREA;
  const qr = QRCode.create(voucherUrl(art.publicId), { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const total = count + QR_QUIET_MODULES * 2;
  // Módulos de un número ENTERO de píxeles reales: bordes nítidos y lectura confiable.
  const cell = Math.max(1, Math.floor((size * scale) / total));
  const boxPx = cell * total;
  const left = Math.round((x + (size - boxPx / scale) / 2) * scale);
  const top = Math.round(y * scale);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = QR_LIGHT;
  ctx.fillRect(left, top, boxPx, boxPx);
  ctx.fillStyle = QR_DARK;
  const origin = QR_QUIET_MODULES * cell;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.modules.get(row, col)) ctx.fillRect(left + origin + col * cell, top + origin + row * cell, cell, cell);
    }
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `700 11.5px ${family}`;
  setSpacing(ctx, "0.6px");
  ctx.fillText(art.code, QR_CODE.centerX, QR_CODE.baseline);
  setSpacing(ctx, "0px");
}

/**
 * Dibuja el voucher completo. El canvas queda en VOUCHER_WIDTH·scale × VOUCHER_HEIGHT·scale
 * píxeles; en pantalla se muestra reducido con CSS (misma proporción).
 */
export async function renderVoucher(canvas: HTMLCanvasElement, art: VoucherArt, fontFamily: string, scale = VOUCHER_SCALE) {
  const background = BACKGROUNDS[art.cookieQuantity];
  if (!background) throw new Error("Tipo de voucher desconocido");
  const [image] = await Promise.all([loadImage(background), ensureFonts(fontFamily)]);

  canvas.width = VOUCHER_WIDTH * scale;
  canvas.height = VOUCHER_HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, VOUCHER_WIDTH, VOUCHER_HEIGHT);

  drawDateTag(ctx, art.expiresAt, fontFamily);
  drawQr(ctx, art, fontFamily, scale);
}

export const voucherImageFileName = (code: string) => `voucher-${code}.png`;

/** PNG del voucher (3072 × 1022 px) con exactamente el mismo dibujo que la vista. */
export async function renderVoucherPng(art: VoucherArt, fontFamily: string, scale = VOUCHER_SCALE): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderVoucher(canvas, art, fontFamily, scale);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
  });
}
