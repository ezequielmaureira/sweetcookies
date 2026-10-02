"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { BASE_UNIT_LABELS, formatDate, formatUnitCost, listIngredients, type Ingredient } from "@/lib/admin/gestion";
import adminStyles from "../Admin.module.css";
import styles from "./Gestion.module.css";

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** /admin/gestion/ingredientes: tarjetas con costo actual y buscador. */
export function IngredientsList() {
  const { getToken, isLoaded } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await listIngredients(await getToken());
        if (!cancelled) setIngredients(res.ingredients);
      } catch (e) {
        if (!cancelled) setError(adminErrorMessage(e, "No pudimos cargar los ingredientes."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  const visible = (ingredients ?? []).filter((i) => normalize(i.name).includes(normalize(q.trim())));

  return (
    <>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={`${adminStyles.input} ${styles.search}`}
          placeholder="Buscar ingrediente"
          aria-label="Buscar ingrediente"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ButtonLink href="/admin/gestion/ingredientes/nuevo">+ Nuevo ingrediente</ButtonLink>
      </div>

      {error && (
        <p className={adminStyles.statusError} role="alert">
          {error}
        </p>
      )}
      {!ingredients && !error && (
        <p className={adminStyles.status} role="status">
          Cargando ingredientes…
        </p>
      )}
      {ingredients && ingredients.length === 0 && <p className={styles.empty}>Todavía no hay ingredientes. Creá el primero con “+ Nuevo ingrediente”.</p>}
      {ingredients && ingredients.length > 0 && visible.length === 0 && <p className={styles.empty}>No hay ingredientes que coincidan con “{q}”.</p>}

      <ul className={styles.list}>
        {visible.map((i) => (
          <li key={i.id}>
            <Link href={`/admin/gestion/ingredientes/${i.id}`} className={styles.item}>
              <span className={styles.itemHead}>
                <span className={styles.itemName}>{i.name}</span>
                {!i.active && <span className={styles.chip}>INACTIVO</span>}
              </span>
              {i.unitCost ? (
                <span className={styles.cost}>{formatUnitCost(i.unitCost, i.baseUnit)}</span>
              ) : (
                <span className={styles.warn}>⚠ Sin precio</span>
              )}
              <span className={styles.itemMeta}>
                Unidad: {BASE_UNIT_LABELS[i.baseUnit].toLowerCase()}
                {i.lastPriceDate && ` · Actualizado: ${formatDate(i.lastPriceDate)}`}
                {i.recipeCount > 0 && ` · En ${i.recipeCount} ${i.recipeCount === 1 ? "receta" : "recetas"}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
