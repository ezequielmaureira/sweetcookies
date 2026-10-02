import Link from "next/link";
import { ProductionSimulator } from "@/components/admin/gestion/ProductionSimulator";
import styles from "@/components/admin/Admin.module.css";

/** /admin/gestion/simulador: calculadora de producción (no guarda nada). */
export default function SimuladorPage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <Link href="/admin/gestion" className={styles.back}>
          ← Gestión
        </Link>
        <h1 className={styles.title}>Simulador de producción</h1>
        <p className={styles.lead}>Elegí cuántas cookies querés preparar.</p>
      </header>
      <ProductionSimulator />
    </div>
  );
}
