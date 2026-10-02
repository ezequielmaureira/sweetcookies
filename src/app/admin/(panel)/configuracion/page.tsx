import Link from "next/link";
import { OrdersSwitch } from "@/components/admin/orders-status/OrdersSwitch";
import { SettingsForm } from "@/components/admin/SettingsForm";
import styles from "@/components/admin/Admin.module.css";

export default function AdminSettingsPage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <Link href="/admin" className={styles.back}>
          ← Panel
        </Link>
        <h1 className={styles.title}>Configuración</h1>
        <p className={styles.lead}>Los cambios se aplican en la web al instante, sin redeploy.</p>
      </header>
      <Link href="/admin/configuracion/textos" className={`${styles.card} ${styles.linkCard}`}>
        <span className={styles.cardTitle}>Textos del sitio</span>
        <span className={styles.cardText}>Frases, títulos y botones de la web: cookie de entrada, inicio, sabores y más.</span>
        <span className={styles.cardArrow} aria-hidden="true">
          →
        </span>
      </Link>
      <OrdersSwitch withMessage />
      <SettingsForm />
    </div>
  );
}
