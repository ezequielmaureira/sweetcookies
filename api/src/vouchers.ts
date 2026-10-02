/**
 * Vouchers de regalo: validación, códigos y estado calculado (lógica pura).
 *
 * "Vencido" no se guarda en la base: es un voucher ACTIVE cuyo expiresAt ya
 * pasó. Por eso el estado visible se calcula siempre al leer.
 */
import { randomInt } from "node:crypto";

export type StoredVoucherStatus = "ACTIVE" | "REDEEMED" | "CANCELLED";
/** Estado que ven el admin y el QR. */
export type VoucherDisplayStatus = "ACTIVE" | "EXPIRED" | "REDEEMED" | "CANCELLED";

export const VOUCHER_QUANTITIES = [4, 6] as const;
export type VoucherQuantity = (typeof VOUCHER_QUANTITIES)[number];

export type VoucherRecord = {
  id: string;
  publicId: string;
  code: string;
  description: string | null;
  cookieQuantity: number;
  expiresAt: Date;
  status: StoredVoucherStatus;
  createdAt: Date;
  createdByUserId: string | null;
  redeemedAt: Date | null;
  redeemedByUserId: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
};

export function displayStatus(v: Pick<VoucherRecord, "status" | "expiresAt">, now = new Date()): VoucherDisplayStatus {
  if (v.status === "ACTIVE" && v.expiresAt.getTime() < now.getTime()) return "EXPIRED";
  return v.status;
}

/* ---------- Códigos ---------- */

/** Sin 0/O ni 1/I/L: se leen y se dictan sin confusión. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PUBLIC_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** 16 caracteres base62 ≈ 95 bits: el QR no se puede adivinar. */
export const PUBLIC_ID_LENGTH = 16;

const randomString = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");

/** Código visible: SC- + 6 caracteres (31⁶ ≈ 887 millones de combinaciones). */
export const generateVoucherCode = () => `SC-${randomString(CODE_ALPHABET, 6)}`;

/** Identificador del QR (criptográficamente aleatorio). */
export const generatePublicId = () => randomString(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);

export const isValidPublicId = (value: string) => /^[0-9a-zA-Z]{16}$/.test(value);

const CODE_BODY = new RegExp(`^[${CODE_ALPHABET}]{6}$`);

/**
 * Código tipeado a mano → formato guardado (SC-XXXXXX), o null si no puede ser un código.
 * Acepta con o sin "SC-", mayúsculas o minúsculas y espacios: "sc-8k4p2m", "8K4P2M", "SC 8K4P2M".
 */
export function normalizeVoucherCode(raw: string): string | null {
  let value = raw.toUpperCase().replace(/[\s-]+/g, "");
  if (value.length === 8 && value.startsWith("SC")) value = value.slice(2);
  return CODE_BODY.test(value) ? `SC-${value}` : null;
}

/* ---------- Fechas (Argentina, UTC−3 sin horario de verano) ---------- */

const AR_OFFSET = "-03:00";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Hasta dos años hacia adelante (evita fechas tipeadas por error, ej. 2062). */
const MAX_DAYS_AHEAD = 731;

/** Hoy en Argentina, como YYYY-MM-DD. */
export function todayInArgentina(now = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * "Válido hasta 15/10/2026" incluye todo ese día: expiresAt = 15/10/2026 23:59:59.999 (Argentina).
 * null si la fecha no existe (ej. 31/02).
 */
export function endOfDayInArgentina(value: string): Date | null {
  if (!DATE.test(value)) return null;
  const date = new Date(`${value}T23:59:59.999${AR_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  // Date normaliza 2026-02-31 a marzo: se rechaza si el día no coincide.
  if (todayInArgentina(date) !== value) return null;
  return date;
}

/* ---------- Validación ---------- */

export const VOUCHER_DESCRIPTION_MAX = 120;

export type VoucherInput = { cookieQuantity: VoucherQuantity; expiresAt: Date; description: string | null };
export type VoucherInputErrors = Partial<Record<"cookieQuantity" | "validUntil" | "description" | "body", string>>;

/**
 * Body de POST /api/admin/vouchers: { cookieQuantity: 4 | 6, validUntil: "YYYY-MM-DD", description?: string }.
 * description vacía → null (el voucher muestra "Premio donado por Sweet Cookies").
 */
export function validateVoucherInput(body: unknown, now = new Date()): { ok: true; data: VoucherInput } | { ok: false; errors: VoucherInputErrors } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: { body: "Body inválido." } };
  const input = body as { cookieQuantity?: unknown; validUntil?: unknown; description?: unknown };
  const errors: VoucherInputErrors = {};

  const quantity = input.cookieQuantity;
  const validQuantity = typeof quantity === "number" && (VOUCHER_QUANTITIES as readonly number[]).includes(quantity);
  if (!validQuantity) errors.cookieQuantity = "Elegí caja de 4 o de 6 cookies.";

  const raw = typeof input.validUntil === "string" ? input.validUntil.trim() : "";
  const expiresAt = endOfDayInArgentina(raw);
  if (!expiresAt) {
    errors.validUntil = "Elegí una fecha válida.";
  } else if (raw < todayInArgentina(now)) {
    errors.validUntil = "La fecha no puede ser anterior a hoy.";
  } else if (expiresAt.getTime() - now.getTime() > MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
    errors.validUntil = "Elegí una fecha dentro de los próximos 2 años.";
  }

  const description = typeof input.description === "string" ? input.description.replace(/\s+/g, " ").trim() : "";
  if (input.description !== undefined && input.description !== null && typeof input.description !== "string") errors.description = "Descripción inválida.";
  else if (description.length > VOUCHER_DESCRIPTION_MAX) errors.description = `Máximo ${VOUCHER_DESCRIPTION_MAX} caracteres.`;

  if (Object.keys(errors).length > 0 || !expiresAt || !validQuantity) return { ok: false, errors };
  return { ok: true, data: { cookieQuantity: quantity as VoucherQuantity, expiresAt, description: description || null } };
}

/* ---------- Filtros del historial ---------- */

export const VOUCHER_FILTERS = ["all", "active", "redeemed", "expired", "cancelled"] as const;
export type VoucherFilter = (typeof VOUCHER_FILTERS)[number];

export type VoucherListQuery = { filter: VoucherFilter; page: number; pageSize: number };

export function parseVoucherListQuery(params: URLSearchParams): VoucherListQuery {
  const raw = params.get("status") ?? "all";
  const filter = ((VOUCHER_FILTERS as readonly string[]).includes(raw) ? raw : "all") as VoucherFilter;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(params.get("pageSize") ?? "30", 10) || 30));
  return { filter, page, pageSize };
}

/** where de Prisma para cada filtro (activo/vencido dependen de la hora actual). */
export function voucherWhere(filter: VoucherFilter, now = new Date()) {
  switch (filter) {
    case "active":
      return { status: "ACTIVE" as const, expiresAt: { gte: now } };
    case "expired":
      return { status: "ACTIVE" as const, expiresAt: { lt: now } };
    case "redeemed":
      return { status: "REDEEMED" as const };
    case "cancelled":
      return { status: "CANCELLED" as const };
    default:
      return {};
  }
}

/* ---------- Respuestas ---------- */

/** Lo que ve cualquiera que escanee el QR: sin ids internos ni usuarios. */
export type PublicVoucher = {
  publicId: string;
  code: string;
  /** null = "Premio donado por Sweet Cookies" (lo resuelve la web). */
  description: string | null;
  cookieQuantity: number;
  expiresAt: string;
  status: VoucherDisplayStatus;
  redeemedAt: string | null;
  cancelledAt: string | null;
};

export type AdminVoucher = PublicVoucher & {
  id: string;
  createdAt: string;
  createdByUserId: string | null;
  redeemedByUserId: string | null;
  cancelledByUserId: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toPublicVoucher(v: VoucherRecord, now = new Date()): PublicVoucher {
  return {
    publicId: v.publicId,
    code: v.code,
    description: v.description,
    cookieQuantity: v.cookieQuantity,
    expiresAt: v.expiresAt.toISOString(),
    status: displayStatus(v, now),
    redeemedAt: iso(v.redeemedAt),
    cancelledAt: iso(v.cancelledAt),
  };
}

export function toAdminVoucher(v: VoucherRecord, now = new Date()): AdminVoucher {
  return {
    ...toPublicVoucher(v, now),
    id: v.id,
    createdAt: v.createdAt.toISOString(),
    createdByUserId: v.createdByUserId,
    redeemedByUserId: v.redeemedByUserId,
    cancelledByUserId: v.cancelledByUserId,
  };
}
