"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { redeemVoucher } from "@/lib/admin/voucher-api";
import { VOUCHER_STATUS_LABELS, boxLabel, type PublicVoucher } from "@/lib/vouchers/voucher-format";
import { ConfirmDialog } from "./ConfirmDialog";
import { VoucherStatusCard } from "./VoucherStatusCard";
import styles from "./VoucherCheck.module.css";

/**
 * Vista del QR para un ADMIN (sesión de Clerk verificada en el servidor):
 * agrega "Canjear voucher" si está activo. El canje lo decide el backend con
 * un UPDATE atómico; acá solo se muestra lo que la base respondió.
 */
export function AdminVoucherCheck({ initial }: { initial: PublicVoucher }) {
  const { getToken } = useAuth();
  const [voucher, setVoucher] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const redeem = async () => {
    setBusy(true);
    try {
      const response = await redeemVoucher(await getToken(), voucher.publicId);
      if (response.voucher) setVoucher(response.voucher);
      if (response.ok) {
        setResult({ kind: "ok", text: "Canje registrado ✓ Entregá la caja." });
      } else {
        const status = response.voucher?.status;
        setResult({
          kind: "error",
          text: status ? `No se canjeó: el voucher está ${VOUCHER_STATUS_LABELS[status].toLowerCase()}.` : "No se canjeó: el voucher no es válido.",
        });
      }
    } catch (error) {
      setResult({ kind: "error", text: adminErrorMessage(error, "No pudimos canjear el voucher. Probá de nuevo.") });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <VoucherStatusCard voucher={voucher}>
      {result && (
        <p className={result.kind === "ok" ? styles.resultOk : styles.resultError} role="status">
          {result.text}
        </p>
      )}
      {voucher.status === "ACTIVE" && (
        <div className={styles.adminActions}>
          <Button className={styles.redeem} onClick={() => setConfirming(true)} disabled={busy}>
            Canjear voucher
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title="Confirmar canje"
        confirmLabel="Confirmar"
        busy={busy}
        onConfirm={() => void redeem()}
        onCancel={() => !busy && setConfirming(false)}
      >
        <p className={styles.confirmBox}>
          {boxLabel(voucher.cookieQuantity)}
          <strong>{voucher.code}</strong>
        </p>
      </ConfirmDialog>
    </VoucherStatusCard>
  );
}
