"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { deleteVoucher } from "@/lib/admin/voucher-api";
import { VOUCHER_STATUS_LABELS, type AdminVoucher } from "@/lib/vouchers/voucher-format";
import styles from "./Vouchers.module.css";

/**
 * "Eliminar" con confirmación fuerte, en CUALQUIER estado. Si ya estaba
 * canjeado, avisa que se pierde el historial de canje.
 */
export function useDeleteVoucher(onDeleted: (voucher: AdminVoucher) => void) {
  const { getToken } = useAuth();
  const [target, setTarget] = useState<AdminVoucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      // Si ya no existía (otra pestaña lo borró), el resultado para el admin es el mismo.
      await deleteVoucher(await getToken(), target.publicId);
      setMessage({ kind: "ok", text: "Voucher eliminado ✓" });
      setTarget(null);
      onDeleted(target);
    } catch (error) {
      setMessage({ kind: "error", text: adminErrorMessage(error, "No pudimos eliminar el voucher.") });
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <ConfirmDialog
      open={target !== null}
      title="Eliminar voucher"
      confirmLabel="Eliminar definitivamente"
      danger
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={() => !busy && setTarget(null)}
    >
      {target && (
        <>
          <dl className={styles.deleteFacts}>
            <div>
              <dt>Código</dt>
              <dd className={styles.code}>{target.code}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{VOUCHER_STATUS_LABELS[target.status].toUpperCase()}</dd>
            </div>
          </dl>
          {target.status === "REDEEMED" && (
            <p className={styles.error} role="alert">
              Este voucher ya fue canjeado y se perderá su historial de canje.
            </p>
          )}
          <p>¿Querés eliminar definitivamente este voucher?</p>
          <p>
            <strong>Esta acción no se puede deshacer.</strong> Su QR va a dejar de ser válido.
          </p>
        </>
      )}
    </ConfirmDialog>
  );

  return { askDelete: setTarget, dialog, message };
}
