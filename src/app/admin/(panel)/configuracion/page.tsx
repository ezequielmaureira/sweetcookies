import Link from "next/link";
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
      <SettingsForm />
    </div>
  );
}
