import Link from "next/link";
import { Suspense } from "react";
import { IngredientsSheet } from "@/components/admin/gestion/IngredientsSheet";
import styles from "@/components/admin/Admin.module.css";

/** /admin/gestion/ingredientes: planilla de ingredientes (se edita en la misma fila). */
export default function IngredientesPage() {
  return (
    <div className={styles.narrowWide}>
      <header className={styles.pageHeaderCompact}>
        <Link href="/admin/gestion" className={styles.back}>
          ← Gestión
        </Link>
        <h1 className={styles.title}>Ingredientes</h1>
      </header>
      <Suspense>
        <IngredientsSheet />
      </Suspense>
    </div>
  );
}
