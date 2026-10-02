"use client";

import { Button } from "@/components/ui/Button";
import buttonStyles from "@/components/ui/Button.module.css";
import { VoucherCanvas } from "@/components/vouchers/VoucherCanvas";
import { VoucherStatusBadge } from "@/components/vouchers/VoucherStatusBadge";
import { boxLabel, formatVoucherDate, formatVoucherDateTime, type AdminVoucher } from "@/lib/vouchers/voucher-format";
import { VoucherShareActions } from "./VoucherShareActions";
import styles from "./Vouchers.module.css";

type Props = {
  voucher: AdminVoucher;
  /** Botón "Anular" (solo vouchers activos). */
  onCancel?: () => void;
  /** Acciones extra al final (Crear otro, Volver…). */
  children?: React.ReactNode;
};

/**
 * Voucher 100 % online: preview + datos + acciones según el estado.
 * ACTIVO: ver voucher, ver imagen, compartir, WhatsApp, email, copiar link, anular.
 * CANJEADO / VENCIDO: ver voucher e imagen · ANULADO: solo ver voucher.
 */
export function VoucherSheet({ voucher, onCancel, children }: Props) {
  const { status } = voucher;

  return (
    <div className={styles.sheet}>
      <VoucherCanvas art={voucher} stamp={status === "CANCELLED" ? "ANULADO" : undefined} />

      <dl className={styles.facts}>
        <div>
          <dt>Tipo</dt>
          <dd>{boxLabel(voucher.cookieQuantity)}</dd>
        </div>
        <div>
          <dt>Válido hasta</dt>
          <dd>{formatVoucherDate(voucher.expiresAt)}</dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd className={styles.code}>{voucher.code}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <VoucherStatusBadge status={status} />
          </dd>
        </div>
        <div>
          <dt>Creado</dt>
          <dd>{formatVoucherDateTime(voucher.createdAt)}</dd>
        </div>
        {voucher.redeemedAt && (
          <div>
            <dt>Canjeado</dt>
            <dd>
              {formatVoucherDateTime(voucher.redeemedAt)}
              {voucher.redeemedBy !== undefined && <span className={styles.by}>por {voucher.redeemedBy ?? voucher.redeemedByUserId ?? "—"}</span>}
            </dd>
          </div>
        )}
        {voucher.cancelledAt && (
          <div>
            <dt>Anulado</dt>
            <dd>
              {formatVoucherDateTime(voucher.cancelledAt)}
              {voucher.cancelledBy !== undefined && <span className={styles.by}>por {voucher.cancelledBy ?? voucher.cancelledByUserId ?? "—"}</span>}
            </dd>
          </div>
        )}
      </dl>

      <div className={styles.actions}>
        <a href={`/v/${encodeURIComponent(voucher.publicId)}`} target="_blank" rel="noopener" className={`${buttonStyles.button} ${buttonStyles.primary}`}>
          Ver voucher
        </a>
        {status !== "CANCELLED" && (
          <a href={`/v/${encodeURIComponent(voucher.publicId)}/image`} target="_blank" rel="noopener" className={`${buttonStyles.button} ${buttonStyles.secondary}`}>
            Ver imagen
          </a>
        )}
        {status === "ACTIVE" && <VoucherShareActions voucher={voucher} />}
        {status === "ACTIVE" && onCancel && (
          <Button variant="secondary" className={styles.cancelButton} onClick={onCancel}>
            Anular
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
