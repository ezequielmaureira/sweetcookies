"use client";

import { useEffect, useState } from "react";
import { boxLabel, formatVoucherDate } from "@/lib/vouchers/voucher-format";
import { VOUCHER_HEIGHT, VOUCHER_SCALE, VOUCHER_WIDTH, renderVoucherPng, type VoucherArt } from "@/lib/vouchers/voucher-render";
import { voucherFont } from "./voucher-font";
import styles from "./VoucherCheck.module.css";

/**
 * La imagen PNG final del voucher (mismo render que la vista online).
 * Es un <img> real: en el celular se puede mantener presionada para guardarla o compartirla.
 */
export function VoucherImage({ art }: { art: VoucherArt }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { cookieQuantity, expiresAt, code, publicId } = art;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    renderVoucherPng({ cookieQuantity, expiresAt, code, publicId }, voucherFont.style.fontFamily)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [cookieQuantity, expiresAt, code, publicId]);

  const alt = `Voucher Sweet Cookies: ${boxLabel(cookieQuantity)}, válido hasta ${formatVoucherDate(expiresAt)}, código ${code}`;

  return (
    <figure className={`${styles.image} ${voucherFont.className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- PNG generado en el navegador (blob:), no pasa por next/image
        <img src={src} alt={alt} width={VOUCHER_WIDTH * VOUCHER_SCALE} height={VOUCHER_HEIGHT * VOUCHER_SCALE} />
      ) : (
        <span className={styles.imageNote}>{failed ? "No pudimos generar la imagen. Recargá la página." : "Generando imagen…"}</span>
      )}
    </figure>
  );
}
