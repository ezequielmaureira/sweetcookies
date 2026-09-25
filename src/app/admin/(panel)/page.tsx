import Link from "next/link";
import { requireAdminGate } from "@/lib/admin/gate-server";
import styles from "@/components/admin/Admin.module.css";

export default async function AdminHomePage() {
  await requireAdminGate("/admin");

  return (
    <>
      <header className={styles.pageHeader}>
        <p className="kicker">Panel</p>
        <h1 className={styles.title}>Hola.</h1>
        <p className={styles.lead}>Desde acá manejás la configuración de Sweet Cookies.</p>
      </header>

      <ul className={styles.cards}>
        <li>
          <Link href="/admin/configuracion" className={styles.card}>
            <span className={styles.cardTitle}>Configuración</span>
            <span className={styles.cardText}>WhatsApp, Instagram y pedidos.</span>
            <span className={styles.cardArrow} aria-hidden="true">→</span>
          </Link>
        </li>
        <li>
          <div className={`${styles.card} ${styles.cardDisabled}`} aria-disabled="true">
            <span className={styles.cardTitle}>Cookies</span>
            <span className={styles.cardText}>Sabores, fotos y disponibilidad.</span>
            <span className={styles.soon}>Próximamente</span>
          </div>
        </li>
      </ul>
    </>
  );
}
