import Link from "next/link";
import { SiteTextsForm } from "@/components/admin/SiteTextsForm";
import styles from "@/components/admin/Admin.module.css";

export default function AdminSiteTextsPage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <Link href="/admin/configuracion" className={styles.back}>
          ← Configuración
        </Link>
        <h1 className={styles.title}>Textos del sitio</h1>
        <p className={styles.lead}>
          Las frases, títulos y botones que ve el cliente. Cambiá lo que quieras y tocá “Guardar cambios”: la web se actualiza en
          unos segundos.
        </p>
      </header>
      <SiteTextsForm />
    </div>
  );
}
