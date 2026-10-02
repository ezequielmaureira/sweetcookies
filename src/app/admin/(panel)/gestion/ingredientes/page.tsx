import Link from "next/link";
import { IngredientsList } from "@/components/admin/gestion/IngredientsList";
import styles from "@/components/admin/Admin.module.css";

export default function IngredientesPage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <Link href="/admin/gestion" className={styles.back}>
          ← Gestión
        </Link>
        <h1 className={styles.title}>Ingredientes</h1>
        <p className={styles.lead}>El costo actual de cada ingrediente es el de su compra más reciente.</p>
      </header>
      <IngredientsList />
    </div>
  );
}
