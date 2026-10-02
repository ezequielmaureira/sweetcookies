import Link from "next/link";
import { IngredientCreate } from "@/components/admin/gestion/IngredientCreate";
import styles from "@/components/admin/Admin.module.css";

export default function NuevoIngredientePage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <Link href="/admin/gestion/ingredientes" className={styles.back}>
          ← Ingredientes
        </Link>
        <h1 className={styles.title}>Nuevo ingrediente</h1>
        <p className={styles.lead}>Después de crearlo vas a poder cargar su precio.</p>
      </header>
      <IngredientCreate />
    </div>
  );
}
