import { VouchersAdmin } from "@/components/admin/vouchers/VouchersAdmin";
import vouchersStyles from "@/components/admin/vouchers/Vouchers.module.css";
import { ButtonLink } from "@/components/ui/Button";
import styles from "@/components/admin/Admin.module.css";

export default function AdminVouchersPage() {
  return (
    <>
      <header className={vouchersStyles.headerRow}>
        <div>
          <p className="kicker">Regalos</p>
          <h1 className={styles.title}>Vouchers</h1>
          <p className={styles.lead}>Cajas de 4 o 6 cookies con QR único. Cada voucher se canjea una sola vez.</p>
        </div>
        <div className={vouchersStyles.mainActions}>
          <ButtonLink href="/admin/vouchers/nuevo">+ Crear voucher</ButtonLink>
          <ButtonLink href="/admin/vouchers/escanear" variant="secondary">
            📷 Escanear
          </ButtonLink>
        </div>
      </header>
      <VouchersAdmin />
    </>
  );
}
