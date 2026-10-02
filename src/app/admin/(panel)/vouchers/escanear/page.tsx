import type { Metadata } from "next";
import Link from "next/link";
import { VoucherScanner } from "@/components/admin/vouchers/VoucherScanner";
import styles from "@/components/admin/Admin.module.css";

export const metadata: Metadata = { title: "Escanear voucher — Sweet Cookies" };

/** /admin/vouchers/escanear: solo admin (lo verifica src/app/admin/layout.tsx en el servidor). */
export default function AdminVoucherScanPage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <Link href="/admin/vouchers" className={styles.back}>
          ← Vouchers
        </Link>
        <h1 className={styles.title}>Escanear voucher</h1>
        <p className={styles.lead}>Mostrame el QR del voucher</p>
      </header>
      <VoucherScanner />
    </>
  );
}
