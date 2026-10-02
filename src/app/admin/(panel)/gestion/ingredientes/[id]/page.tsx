import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IngredientDetail } from "@/components/admin/gestion/IngredientDetail";
import styles from "@/components/admin/Admin.module.css";

export default async function IngredientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/.test(id)) notFound();
  return (
    <div className={styles.narrow}>
      <Suspense>
        <IngredientDetail id={id} />
      </Suspense>
    </div>
  );
}
