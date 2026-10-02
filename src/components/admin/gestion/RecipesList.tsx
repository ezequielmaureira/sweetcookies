"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { formatMoney, listRecipes, type Recipe } from "@/lib/admin/gestion";
import adminStyles from "../Admin.module.css";
import styles from "./Gestion.module.css";

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** /admin/gestion/recetas: costo por cookie de cada receta (con los precios actuales). */
export function RecipesList() {
  const { getToken, isLoaded } = useAuth();
  const deleted = useSearchParams().get("eliminada") === "1";
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await listRecipes(await getToken());
        if (!cancelled) setRecipes(res.recipes);
      } catch (e) {
        if (!cancelled) setError(adminErrorMessage(e, "No pudimos cargar las recetas."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  const visible = (recipes ?? []).filter((r) => normalize(r.name).includes(normalize(q.trim())));

  return (
    <>
      <div className={styles.toolbar}>
        <input type="search" className={`${adminStyles.input} ${styles.search}`} placeholder="Buscar receta" aria-label="Buscar receta" value={q} onChange={(e) => setQ(e.target.value)} />
        <ButtonLink href="/admin/gestion/recetas/nueva">+ Nueva receta</ButtonLink>
      </div>

      {deleted && (
        <p className={styles.ok} role="status" style={{ marginBottom: 16 }}>
          Receta eliminada ✓
        </p>
      )}
      {error && (
        <p className={adminStyles.statusError} role="alert">
          {error}
        </p>
      )}
      {!recipes && !error && (
        <p className={adminStyles.status} role="status">
          Cargando recetas…
        </p>
      )}
      {recipes && recipes.length === 0 && <p className={styles.empty}>Todavía no hay recetas. Creá la primera con “+ Nueva receta”.</p>}
      {recipes && recipes.length > 0 && visible.length === 0 && <p className={styles.empty}>No hay recetas que coincidan con “{q}”.</p>}

      <ul className={styles.list}>
        {visible.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/gestion/recetas/${r.id}`} className={styles.item}>
              <span className={styles.itemHead}>
                <span className={styles.itemName}>{r.name}</span>
                <span className={styles.itemMeta}>Rinde {r.yieldQuantity} {r.yieldQuantity === 1 ? "cookie" : "cookies"}</span>
              </span>
              {r.summary.costPerCookie ? (
                <span className={styles.cost}>{formatMoney(r.summary.costPerCookie)} por 1 cookie</span>
              ) : (
                <span className={styles.warn}>⚠ Costo incompleto</span>
              )}
              <span className={styles.itemMeta}>
                {r.ingredients.length} {r.ingredients.length === 1 ? "ingrediente" : "ingredientes"}
                {r.summary.totalCost
                  ? ` · Ingredientes ${formatMoney(r.summary.ingredientsCost)} · Gastos ${formatMoney(r.summary.extrasCost)} · Total ${formatMoney(r.summary.totalCost)}`
                  : ` · Faltan ${r.summary.missingPrices} ${r.summary.missingPrices === 1 ? "precio" : "precios"}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
