import Link from "next/link";
import { Suspense } from "react";
import { RecipesList } from "@/components/admin/gestion/RecipesList";
import styles from "@/components/admin/Admin.module.css";

export default function RecetasPage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <Link href="/admin/gestion" className={styles.back}>
          ← Gestión
        </Link>
        <h1 className={styles.title}>Recetas</h1>
        <p className={styles.lead}>El costo se calcula siempre con el precio actual de cada ingrediente.</p>
      </header>
      <Suspense>
        <RecipesList />
      </Suspense>
    </div>
  );
}
