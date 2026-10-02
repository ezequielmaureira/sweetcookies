import Link from "next/link";
import { VoucherCreate } from "@/components/admin/vouchers/VoucherCreate";
import styles from "@/components/admin/Admin.module.css";

export default function AdminVoucherCreatePage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <Link href="/admin/vouchers" className={styles.back}>
          ← Vouchers
        </Link>
        <h1 className={styles.title}>Crear voucher</h1>
      </header>
      <VoucherCreate />
    </>
  );
}
