/**
 * Escáner del admin: qué QR se aceptan y cómo se normaliza el código manual.
 * El QR solo aporta el publicId: el estado SIEMPRE se consulta al backend.
 */
import { PRODUCTION_VOUCHER_BASE_URL, VOUCHER_BASE_URL, isValidPublicId } from "./voucher-format.ts";

const VOUCHER_PATH = /^\/v\/([0-9a-zA-Z]{16})\/?$/;

/**
 * publicId de un QR de Sweet Cookies, o null si el QR es de otra cosa.
 * Acepta la web de producción y la base configurada (NEXT_PUBLIC_VOUCHER_BASE_URL).
 * No se navega nunca a la URL escaneada.
 */
export function extractVoucherPublicId(text: string, bases: readonly string[] = [PRODUCTION_VOUCHER_BASE_URL, VOUCHER_BASE_URL]): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  const allowed = new Set(
    bases.flatMap((base) => {
      try {
        return [new URL(base).origin];
      } catch {
        return [];
      }
    }),
  );
  if (!allowed.has(url.origin) || url.username || url.password) return null;
  const match = VOUCHER_PATH.exec(url.pathname);
  return match && isValidPublicId(match[1]) ? match[1] : null;
}

/** Mismo alfabeto que genera el backend (sin 0/O ni 1/I/L). */
const CODE_BODY = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/** "sc-8k4p2m", "8K4P2M", "SC 8K4P2M" → "SC-8K4P2M". null si no puede ser un código. */
export function normalizeVoucherCode(raw: string): string | null {
  let value = raw.toUpperCase().replace(/[\s-]+/g, "");
  if (value.length === 8 && value.startsWith("SC")) value = value.slice(2);
  return CODE_BODY.test(value) ? `SC-${value}` : null;
}
