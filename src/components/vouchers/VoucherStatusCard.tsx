import { site } from "@/data/site";
import { boxLabel, formatVoucherDate, formatVoucherDateTime, type PublicVoucher } from "@/lib/vouchers/voucher-format";
import { VoucherQr } from "./VoucherQr";
import { voucherFont } from "./voucher-font";
import styles from "./VoucherCheck.module.css";

const HEADINGS: Record<PublicVoucher["status"], string> = {
  ACTIVE: "Voucher válido",
  EXPIRED: "Voucher vencido",
  REDEEMED: "Voucher ya canjeado",
  CANCELLED: "Voucher anulado",
};

type Props = {
  /** null = el QR no corresponde a ningún voucher. */
  voucher: PublicVoucher | null;
  /** Vista del cliente: QR grande para mostrar en el local (solo si está activo). */
  showQr?: boolean;
  children?: React.ReactNode;
};

/** Resultado de escanear el QR. Solo muestra; canjear lo agrega el admin (ver AdminVoucherCheck). */
export function VoucherStatusCard({ voucher, showQr = false, children }: Props) {
  const tone = voucher?.status === "ACTIVE" ? styles.valid : styles.invalid;
  return (
    <article className={`${styles.card} ${tone}`} aria-labelledby="voucher-estado">
      <span className={styles.icon} aria-hidden="true">
        {voucher?.status === "ACTIVE" ? "✓" : "✕"}
      </span>
      <h1 id="voucher-estado" className={`${styles.heading} ${voucherFont.className}`}>
        {voucher ? HEADINGS[voucher.status] : "Voucher no válido"}
      </h1>
      <p className={`${styles.brand} ${voucherFont.className}`}>{site.name}</p>

      {voucher ? (
        <>
          {voucher.status === "ACTIVE" && <p className={`${styles.box} ${voucherFont.className}`}>{boxLabel(voucher.cookieQuantity)}</p>}
          <dl className={styles.facts}>
            <div>
              <dt>Código</dt>
              <dd className={styles.code}>{voucher.code}</dd>
            </div>
            {voucher.status !== "ACTIVE" && (
              <div>
                <dt>Tipo</dt>
                <dd>{boxLabel(voucher.cookieQuantity)}</dd>
              </div>
            )}
            {voucher.status === "REDEEMED" && voucher.redeemedAt ? (
              <div>
                <dt>Canjeado</dt>
                <dd>{formatVoucherDateTime(voucher.redeemedAt)}</dd>
              </div>
            ) : (
              voucher.status !== "CANCELLED" && (
                <div>
                  <dt>Válido hasta</dt>
                  <dd>{formatVoucherDate(voucher.expiresAt)}</dd>
                </div>
              )
            )}
          </dl>
          {voucher.status === "ACTIVE" && showQr && <VoucherQr publicId={voucher.publicId} code={voucher.code} />}
          {voucher.status !== "ACTIVE" && <p className={styles.note}>Este voucher no se puede canjear.</p>}
        </>
      ) : (
        <p className={styles.note}>Este código QR no corresponde a ningún voucher de {site.name}.</p>
      )}
      {children}
    </article>
  );
}
