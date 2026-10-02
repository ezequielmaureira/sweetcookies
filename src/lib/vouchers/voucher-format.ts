/**
 * Vouchers: tipos y formato compartidos por el panel y la página del QR.
 * Las fechas se muestran siempre en hora de Argentina.
 */

export type VoucherStatus = "ACTIVE" | "EXPIRED" | "REDEEMED" | "CANCELLED";
export type VoucherFilter = "all" | "active" | "redeemed" | "expired" | "cancelled";
export type VoucherQuantity = 4 | 6;

/** Lo que devuelve GET /api/public/vouchers/:publicId (estado real, calculado en el servidor). */
export type PublicVoucher = {
  publicId: string;
  code: string;
  /** null o vacía → DEFAULT_VOUCHER_DESCRIPTION. */
  description: string | null;
  cookieQuantity: number;
  expiresAt: string;
  status: VoucherStatus;
  redeemedAt: string | null;
  cancelledAt: string | null;
};

export type AdminVoucher = PublicVoucher & {
  id: string;
  createdAt: string;
  createdByUserId: string | null;
  redeemedByUserId: string | null;
  cancelledByUserId: string | null;
  /** Solo en el detalle: email de quién canjeó / anuló. */
  redeemedBy?: string | null;
  cancelledBy?: string | null;
};

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  ACTIVE: "Activo",
  REDEEMED: "Canjeado",
  EXPIRED: "Vencido",
  CANCELLED: "Anulado",
};

export const VOUCHER_FILTER_LABELS: Record<VoucherFilter, string> = {
  all: "Todos",
  active: "Activos",
  redeemed: "Canjeados",
  expired: "Vencidos",
  cancelled: "Anulados",
};

export const boxLabel = (quantity: number) => `Caja de ${quantity} cookies`;

/** Texto del voucher cuando no se cargó descripción (y en los vouchers anteriores al campo). */
export const DEFAULT_VOUCHER_DESCRIPTION = "Premio donado por Sweet Cookies";
export const VOUCHER_DESCRIPTION_MAX = 120;

export const voucherDescription = (description: string | null | undefined) => description?.trim() || DEFAULT_VOUCHER_DESCRIPTION;

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE });

/** DD/MM/AAAA (Argentina). */
export function formatVoucherDate(iso: string): string {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/** DD/MM/AAAA HH:mm (Argentina). */
export function formatVoucherDateTime(iso: string): string {
  return `${formatVoucherDate(iso)} ${timeFormat.format(new Date(iso))}`;
}

/** Hoy en Argentina como YYYY-MM-DD (mínimo del selector de fecha). */
export function todayInArgentina(now = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Mismo formato que genera el backend (16 caracteres base62). */
export const isValidPublicId = (value: string) => /^[0-9a-zA-Z]{16}$/.test(value);

/**
 * Dominio al que apunta el QR. Por defecto, la web de producción; para probar
 * con el celular en la red local se puede definir NEXT_PUBLIC_VOUCHER_BASE_URL
 * (ej. http://192.168.0.10:3000).
 */
export const PRODUCTION_VOUCHER_BASE_URL = "https://sweetcookies-seven.vercel.app";

export const VOUCHER_BASE_URL = (process.env.NEXT_PUBLIC_VOUCHER_BASE_URL ?? "").trim().replace(/\/+$/, "") || PRODUCTION_VOUCHER_BASE_URL;

export const voucherUrl = (publicId: string, base = VOUCHER_BASE_URL) => `${base}/v/${encodeURIComponent(publicId)}`;

/** Imagen PNG del voucher (misma pieza visual, mismo QR). El link principal sigue siendo voucherUrl. */
export const voucherImageUrl = (publicId: string, base = VOUCHER_BASE_URL) => `${voucherUrl(publicId, base)}/image`;

/* ---------- Compartir (el voucher es 100 % online: se comparte el LINK) ---------- */

type ShareableVoucher = Pick<PublicVoucher, "publicId" | "cookieQuantity" | "expiresAt">;

const SHARE_TITLE = "Tenés un voucher de Sweet Cookies 🍪";

const voucherSummary = (v: ShareableVoucher) => `${boxLabel(v.cookieQuantity)}\nVálido hasta ${formatVoucherDate(v.expiresAt)}`;

/** Texto para "Compartir" (Web Share API). */
export function voucherShareText(v: ShareableVoucher, url = voucherUrl(v.publicId)): string {
  return `${SHARE_TITLE}\n\n${voucherSummary(v)}\n\n${url}`;
}

/** WhatsApp sin destinatario: el admin elige el contacto. Solo el link, sin imágenes. */
export function voucherWhatsAppUrl(v: ShareableVoucher, url = voucherUrl(v.publicId)): string {
  const text = `${SHARE_TITLE}\n\n${voucherSummary(v)}\n\nAbrí tu voucher acá:\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Sin proveedor de email en el proyecto: abre el correo del dispositivo (mailto). */
export function voucherMailtoUrl(v: ShareableVoucher, url = voucherUrl(v.publicId), imageUrl = `${url}/image`): string {
  const body = `Tenés un voucher de Sweet Cookies.\n\n${voucherSummary(v)}\n\nVoucher:\n${url}\n\nImagen del voucher:\n${imageUrl}`;
  return `mailto:?subject=${encodeURIComponent(SHARE_TITLE)}&body=${encodeURIComponent(body)}`;
}
