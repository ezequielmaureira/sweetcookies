import { Suspense } from "react";
import { RecipeEditor } from "@/components/admin/gestion/RecipeEditor";
import styles from "@/components/admin/Admin.module.css";

export default function NuevaRecetaPage() {
  return (
    <div className={styles.narrow}>
      <Suspense>
        <RecipeEditor />
      </Suspense>
    </div>
  );
}
