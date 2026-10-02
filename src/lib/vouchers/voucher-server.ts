import { apiUrl, fetchWithTimeout } from "@/lib/api";
import { isValidPublicId, type PublicVoucher, type VoucherStatus } from "./voucher-format";

export type VoucherLookup = { status: "found"; voucher: PublicVoucher } | { status: "not_found" } | { status: "error" };

const STATUSES: VoucherStatus[] = ["ACTIVE", "EXPIRED", "REDEEMED", "CANCELLED"];

function parseVoucher(raw: unknown): PublicVoucher | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const optionalDate = (value: unknown) => (typeof value === "string" ? value : null);
  if (typeof v.publicId !== "string" || typeof v.code !== "string" || typeof v.cookieQuantity !== "number" || typeof v.expiresAt !== "string") return null;
  if (!STATUSES.includes(v.status as VoucherStatus)) return null;
  return {
    publicId: v.publicId,
    code: v.code,
    cookieQuantity: v.cookieQuantity,
    expiresAt: v.expiresAt,
    status: v.status as VoucherStatus,
    redeemedAt: optionalDate(v.redeemedAt),
    cancelledAt: optionalDate(v.cancelledAt),
  };
}

/**
 * Estado REAL del voucher, consultado al backend en cada visita (sin caché):
 * nunca se confía en datos guardados en el navegador.
 */
export async function lookupVoucher(publicId: string): Promise<VoucherLookup> {
  if (!isValidPublicId(publicId)) return { status: "not_found" };
  const url = apiUrl(`/api/public/vouchers/${encodeURIComponent(publicId)}`);
  if (!url) return { status: "error" };
  try {
    const res = await fetchWithTimeout(url, { cache: "no-store", timeoutMs: 10000 });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error" };
    const voucher = parseVoucher(await res.json());
    return voucher ? { status: "found", voucher } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}
