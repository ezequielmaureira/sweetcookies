import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecipeEditor } from "@/components/admin/gestion/RecipeEditor";
import styles from "@/components/admin/Admin.module.css";

export default async function RecetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/.test(id)) notFound();
  return (
    <div className={styles.narrow}>
      <Suspense>
        <RecipeEditor key={id} recipeId={id} />
      </Suspense>
    </div>
  );
}
