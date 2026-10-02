"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { cancelVoucher } from "@/lib/admin/voucher-api";
import { VOUCHER_STATUS_LABELS, type AdminVoucher } from "@/lib/vouchers/voucher-format";

/** "Anular" con confirmación: ¿Seguro que querés anular SC-XXXXXX? */
export function useCancelVoucher(onDone: (voucher: AdminVoucher) => void) {
  const { getToken } = useAuth();
  const [target, setTarget] = useState<AdminVoucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const result = await cancelVoucher(await getToken(), target.publicId);
      if (result.voucher) onDone(result.voucher);
      setMessage(
        result.ok
          ? { kind: "ok", text: `Voucher ${target.code} anulado.` }
          : { kind: "error", text: result.voucher ? `No se pudo anular: el voucher ya está ${VOUCHER_STATUS_LABELS[result.voucher.status].toLowerCase()}.` : "El voucher no existe." },
      );
      setTarget(null);
    } catch (error) {
      setMessage({ kind: "error", text: adminErrorMessage(error, "No pudimos anular el voucher.") });
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <ConfirmDialog
      open={target !== null}
      title={target ? `¿Seguro que querés anular ${target.code}?` : ""}
      confirmLabel="Anular voucher"
      danger
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={() => !busy && setTarget(null)}
    >
      <p>El QR va a seguir existiendo, pero al escanearlo va a decir “Voucher anulado”. No se puede deshacer.</p>
    </ConfirmDialog>
  );

  return { askCancel: setTarget, dialog, message };
}
