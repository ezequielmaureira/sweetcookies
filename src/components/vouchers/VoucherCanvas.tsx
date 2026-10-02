"use client";

import { useEffect, useRef, useState } from "react";
import { boxLabel, formatVoucherDate } from "@/lib/vouchers/voucher-format";
import { renderVoucher, VOUCHER_HEIGHT, VOUCHER_WIDTH, type VoucherArt } from "@/lib/vouchers/voucher-render";
import { voucherFont } from "./voucher-font";
import styles from "./Voucher.module.css";

type Props = {
  art: VoucherArt;
  /** Sello encima del voucher (ej. ANULADO). */
  stamp?: string;
};

/** Voucher digital: canvas a 2× (nítido en pantallas retina), reducido con CSS sin deformar. */
export function VoucherCanvas({ art, stamp }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const { cookieQuantity, expiresAt, code, publicId } = art;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    renderVoucher(canvas, { cookieQuantity, expiresAt, code, publicId }, voucherFont.style.fontFamily)
      .then(() => {
        if (cancelled) return;
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [cookieQuantity, expiresAt, code, publicId]);

  return (
    <figure className={`${styles.preview} ${voucherFont.className}`} aria-busy={state === "loading"}>
      <canvas
        ref={ref}
        className={styles.canvas}
        width={VOUCHER_WIDTH * 2}
        height={VOUCHER_HEIGHT * 2}
        role="img"
        aria-label={`Voucher Sweet Cookies: ${boxLabel(cookieQuantity)}, válido hasta ${formatVoucherDate(expiresAt)}, código ${code}`}
      />
      {state === "loading" && <span className={styles.previewNote}>Preparando voucher…</span>}
      {state === "error" && <span className={styles.previewNote}>No pudimos dibujar el voucher. Recargá la página.</span>}
      {stamp && state === "ready" && (
        <span className={styles.stamp} aria-hidden="true">
          {stamp}
        </span>
      )}
    </figure>
  );
}
