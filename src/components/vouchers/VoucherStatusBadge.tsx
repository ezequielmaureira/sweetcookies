import { VOUCHER_STATUS_LABELS, type VoucherStatus } from "@/lib/vouchers/voucher-format";
import styles from "./Voucher.module.css";

export function VoucherStatusBadge({ status }: { status: VoucherStatus }) {
  return <span className={`${styles.status} ${styles[`status${status}`]}`}>{VOUCHER_STATUS_LABELS[status]}</span>;
}
