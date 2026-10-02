import { AdminApiError, adminRequest } from "@/lib/admin/admin-api";
import type { AdminVoucher, VoucherFilter, VoucherQuantity } from "@/lib/vouchers/voucher-format";

/** Cliente del panel para vouchers (siempre con el token de Clerk; autoriza el backend). */

export type AdminVoucherList = { vouchers: AdminVoucher[]; total: number; page: number; pageSize: number; totalPages: number };

export const listVouchers = (token: string | null, filter: VoucherFilter, page = 1) => {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  return adminRequest<AdminVoucherList>(`/api/admin/vouchers?${params}`, token);
};

export const getVoucher = (token: string | null, publicId: string) =>
  adminRequest<AdminVoucher>(`/api/admin/vouchers/${encodeURIComponent(publicId)}`, token);

/** Búsqueda manual (respaldo del escáner). Código ya normalizado: SC-XXXXXX. */
export const getVoucherByCode = (token: string | null, code: string) =>
  adminRequest<AdminVoucher>(`/api/admin/vouchers/by-code/${encodeURIComponent(code)}`, token);

/** validUntil: "YYYY-MM-DD" (el backend lo guarda como fin de ese día, hora Argentina). */
export const createVoucher = (token: string | null, input: { cookieQuantity: VoucherQuantity; validUntil: string; description: string }) =>
  adminRequest<AdminVoucher>("/api/admin/vouchers", token, { method: "POST", body: JSON.stringify(input) });

/** Resultado de canjear/anular: ok, o el estado real del voucher (ya canjeado, vencido, anulado). */
export type VoucherTransitionResult = { ok: true; voucher: AdminVoucher } | { ok: false; voucher: AdminVoucher | null };

async function transition(token: string | null, publicId: string, action: "redeem" | "cancel"): Promise<VoucherTransitionResult> {
  try {
    const res = await adminRequest<{ ok: true; voucher: AdminVoucher }>(`/api/admin/vouchers/${encodeURIComponent(publicId)}/${action}`, token, { method: "POST" });
    return res;
  } catch (error) {
    // 409: la base rechazó el cambio (otro canje ganó, venció o se anuló). Se relee el estado real.
    if (error instanceof AdminApiError && (error.status === 409 || error.status === 404)) {
      const voucher = await getVoucher(token, publicId).catch(() => null);
      return { ok: false, voucher };
    }
    throw error;
  }
}

export const redeemVoucher = (token: string | null, publicId: string) => transition(token, publicId, "redeem");
export const cancelVoucher = (token: string | null, publicId: string) => transition(token, publicId, "cancel");
