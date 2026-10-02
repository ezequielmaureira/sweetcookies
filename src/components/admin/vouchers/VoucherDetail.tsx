"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { getVoucher } from "@/lib/admin/voucher-api";
import type { AdminVoucher } from "@/lib/vouchers/voucher-format";
import { VoucherSheet } from "./VoucherSheet";
import { useCancelVoucher } from "./useCancelVoucher";
import styles from "./Vouchers.module.css";

/** Ver un voucher del historial (estado real del backend) con sus acciones. */
export function VoucherDetail({ publicId }: { publicId: string }) {
  const { getToken, isLoaded } = useAuth();
  const [voucher, setVoucher] = useState<AdminVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tras anular se relee el detalle (incluye quién lo anuló).
  const [version, setVersion] = useState(0);
  const { askCancel, dialog, message } = useCancelVoucher(() => setVersion((n) => n + 1));

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getVoucher(await getToken(), publicId);
        if (!cancelled) setVoucher(result);
      } catch (e) {
        if (!cancelled) setError(adminErrorMessage(e, "No pudimos cargar el voucher."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId, getToken, isLoaded, version]);

  return (
    <>
      <header className={styles.detailHeader}>
        <Link href="/admin/vouchers" className={styles.backLink}>
          ← Volver a vouchers
        </Link>
        <h1 className={styles.detailTitle}>{voucher ? `Voucher ${voucher.code}` : "Voucher"}</h1>
      </header>
      {message && (
        <p className={message.kind === "ok" ? styles.ok : styles.error} role="status">
          {message.text}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!voucher && !error && <p className={styles.live}>Cargando…</p>}
      {voucher && <VoucherSheet voucher={voucher} onCancel={() => askCancel(voucher)} />}
      {dialog}
    </>
  );
}
