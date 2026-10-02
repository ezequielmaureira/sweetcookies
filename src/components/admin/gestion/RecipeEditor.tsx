"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import {
  MEASURE_LABELS,
  RECIPE_UNITS,
  createRecipe,
  deleteRecipe,
  formatMoney,
  formatUnitCost,
  getRecipe,
  listIngredients,
  parseAmount,
  saveRecipe,
  toApiNumber,
  toBase,
  type Ingredient,
  type MeasureUnit,
  type Recipe,
} from "@/lib/admin/gestion";
import adminStyles from "../Admin.module.css";
import styles from "./Gestion.module.css";

type Line = { key: string; ingredientId: string; quantity: string; unit: MeasureUnit };
type Extra = { key: string; name: string; amount: string };

let seq = 0;
const newKey = () => `k${++seq}`;
/** "1.25" (API) → "1,25" (lo que se escribe en Argentina). */
const toInput = (value: string) => value.replace(".", ",");

const fromRecipe = (r: Recipe) => ({
  name: r.name,
  yieldText: String(r.yieldQuantity),
  lines: r.ingredients.map((l): Line => ({ key: newKey(), ingredientId: l.ingredientId, quantity: toInput(l.quantity), unit: l.unit })),
  extras: r.extraCosts.map((e): Extra => ({ key: newKey(), name: e.name, amount: toInput(e.amount) })),
});

/**
 * Crear (/admin/gestion/recetas/nueva) o editar (/admin/gestion/recetas/<id>).
 * Los subtotales y el resumen se recalculan mientras se escribe, siempre con
 * el costo ACTUAL de cada ingrediente. El costo no se guarda: se calcula.
 */
export function RecipeEditor({ recipeId }: { recipeId?: string }) {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();
  const justCreated = useSearchParams().get("creada") === "1";
  const uid = useId();
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!recipeId);
  const [name, setName] = useState("");
  const [yieldText, setYieldText] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(justCreated ? { kind: "ok", text: "Receta creada ✓" } : null);
  const [savedName, setSavedName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const [list, recipe] = await Promise.all([listIngredients(token), recipeId ? getRecipe(token, recipeId) : Promise.resolve(null)]);
        if (cancelled) return;
        setIngredients(list.ingredients);
        if (recipe) {
          const s = fromRecipe(recipe);
          setName(s.name);
          setSavedName(s.name);
          setYieldText(s.yieldText);
          setLines(s.lines);
          setExtras(s.extras);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancelled) setLoadError(adminErrorMessage(e, "No pudimos cargar la receta."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId, getToken, isLoaded]);

  if (loadError) {
    return (
      <>
        <Link href="/admin/gestion/recetas" className={adminStyles.back}>
          ← Recetas
        </Link>
        <p className={adminStyles.statusError} role="alert">
          {loadError}
        </p>
      </>
    );
  }
  if (!ingredients || !loaded) {
    return (
      <p className={adminStyles.status} role="status">
        Cargando…
      </p>
    );
  }

  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const clearError = (key: string) => setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));

  /* ----- Cálculo en vivo (el oficial lo hace el servidor al guardar) ----- */
  const lineInfo = lines.map((line) => {
    const ingredient = byId.get(line.ingredientId);
    const q = parseAmount(line.quantity);
    const missingPrice = Boolean(ingredient && !ingredient.unitCost);
    const subtotal = ingredient?.unitCost && q ? toBase(q, line.unit) * Number(ingredient.unitCost) : null;
    return { ingredient, subtotal, missingPrice };
  });
  const ingredientsCost = lineInfo.reduce((sum, l) => sum + (l.subtotal ?? 0), 0);
  const missing = lineInfo.filter((l) => l.missingPrice).length;
  const extrasCost = extras.reduce((sum, e) => sum + (parseAmount(e.amount) ?? 0), 0);
  const yieldQuantity = Number(yieldText.trim());
  const validYield = Number.isInteger(yieldQuantity) && yieldQuantity >= 1;
  const complete = missing === 0;
  const total = ingredientsCost + extrasCost;

  /* ----- Edición ----- */
  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Al cambiar de ingrediente, la unidad tiene que corresponder a su unidad base.
        const ingredient = byId.get(next.ingredientId);
        if (ingredient && !RECIPE_UNITS[ingredient.baseUnit].includes(next.unit)) next.unit = RECIPE_UNITS[ingredient.baseUnit][0];
        return next;
      }),
    );
  const updateExtra = (key: string, patch: Partial<Extra>) => setExtras((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Escribí un nombre.";
    if (!validYield) e.yieldQuantity = "Ingresá cuántas cookies rinde (número entero).";
    lines.forEach((l, i) => {
      if (!l.ingredientId) e[`ingredients.${i}.ingredientId`] = "Elegí un ingrediente.";
      const q = parseAmount(l.quantity);
      if (!q || q <= 0) e[`ingredients.${i}.quantity`] = "Ingresá la cantidad.";
    });
    extras.forEach((x, i) => {
      if (!x.name.trim()) e[`extraCosts.${i}.name`] = "Escribí el concepto.";
      if (parseAmount(x.amount) === null) e[`extraCosts.${i}.amount`] = "Ingresá el monto.";
    });
    setErrors(e);
    if (Object.keys(e).length) {
      setNotice({ kind: "error", text: "Revisá los campos marcados." });
      return;
    }
    const input = {
      name: name.trim(),
      yieldQuantity,
      ingredients: lines.map((l) => ({ ingredientId: l.ingredientId, quantity: toApiNumber(parseAmount(l.quantity)!, 4), unit: l.unit })),
      extraCosts: extras.map((x) => ({ name: x.name.trim(), amount: toApiNumber(parseAmount(x.amount)!, 2) })),
    };
    setSaving(true);
    setNotice(null);
    try {
      const token = await getToken();
      if (recipeId) {
        const saved = await saveRecipe(token, recipeId, input);
        const s = fromRecipe(saved);
        setLines(s.lines);
        setExtras(s.extras);
        setSavedName(s.name);
        setNotice({ kind: "ok", text: "Receta guardada ✓" });
        setSaving(false);
      } else {
        const created = await createRecipe(token, input);
        router.replace(`/admin/gestion/recetas/${created.id}?creada=1`);
      }
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 422) setErrors(err.fields);
      setNotice({ kind: "error", text: adminErrorMessage(err, "No pudimos guardar la receta.") });
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!recipeId) return;
    setDeleting(true);
    try {
      await deleteRecipe(await getToken(), recipeId);
      router.replace("/admin/gestion/recetas?eliminada=1");
    } catch (err) {
      setNotice({ kind: "error", text: adminErrorMessage(err, "No pudimos eliminar la receta.") });
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  const err = (key: string) => (errors[key] ? <p className={adminStyles.error}>{errors[key]}</p> : null);
  const activeIngredients = ingredients.filter((i) => i.active);

  return (
    <form className={adminStyles.form} onSubmit={submit} noValidate aria-busy={saving}>
      <header>
        <Link href="/admin/gestion/recetas" className={adminStyles.back}>
          ← Recetas
        </Link>
        <h1 className={adminStyles.title}>{recipeId ? savedName || "Receta" : "Nueva receta"}</h1>
      </header>

      {notice && (
        <p className={notice.kind === "ok" ? styles.ok : adminStyles.statusError} role={notice.kind === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      <section className={adminStyles.section}>
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-name`} className={adminStyles.label}>
            Nombre
          </label>
          <input
            id={`${uid}-name`}
            className={adminStyles.input}
            maxLength={80}
            placeholder="Ej.: Ferrero"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
            }}
            aria-invalid={Boolean(errors.name)}
          />
          {err("name")}
        </div>
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-yield`} className={adminStyles.label}>
            Rendimiento
          </label>
          <input
            id={`${uid}-yield`}
            className={adminStyles.input}
            inputMode="numeric"
            placeholder="Ej.: 10"
            autoComplete="off"
            value={yieldText}
            onChange={(e) => {
              setYieldText(e.target.value);
              clearError("yieldQuantity");
            }}
            aria-invalid={Boolean(errors.yieldQuantity)}
          />
          <p className={adminStyles.help}>Cantidad de cookies que produce esta receta.</p>
          {err("yieldQuantity")}
        </div>
      </section>

      <section className={adminStyles.section}>
        <h2 className={adminStyles.sectionTitle}>Ingredientes</h2>
        {ingredients.length === 0 && (
          <p className={styles.warnBox}>
            Todavía no cargaste ingredientes. <Link href="/admin/gestion/ingredientes/nuevo">Creá el primero</Link> y volvé a esta receta.
          </p>
        )}
        <div className={styles.lines}>
          {lines.map((line, i) => {
            const { ingredient, subtotal } = lineInfo[i];
            const options = ingredient && !ingredient.active ? [ingredient, ...activeIngredients] : activeIngredients;
            const units = ingredient ? RECIPE_UNITS[ingredient.baseUnit] : (["G"] as MeasureUnit[]);
            return (
              <div key={line.key} className={styles.line}>
                <div className={adminStyles.field}>
                  <label htmlFor={`${uid}-${line.key}-i`} className={adminStyles.label}>
                    Ingrediente
                  </label>
                  <select
                    id={`${uid}-${line.key}-i`}
                    className={`${adminStyles.input} ${styles.select}`}
                    value={line.ingredientId}
                    onChange={(e) => {
                      updateLine(line.key, { ingredientId: e.target.value });
                      clearError(`ingredients.${i}.ingredientId`);
                    }}
                    aria-invalid={Boolean(errors[`ingredients.${i}.ingredientId`])}
                  >
                    <option value="">Elegí un ingrediente</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {!o.active ? " (inactivo)" : ""}
                      </option>
                    ))}
                  </select>
                  {err(`ingredients.${i}.ingredientId`)}
                </div>
                <div className={styles.row}>
                  <div className={adminStyles.field}>
                    <label htmlFor={`${uid}-${line.key}-q`} className={adminStyles.label}>
                      Cantidad
                    </label>
                    <input
                      id={`${uid}-${line.key}-q`}
                      className={adminStyles.input}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Ej.: 300"
                      value={line.quantity}
                      onChange={(e) => {
                        updateLine(line.key, { quantity: e.target.value });
                        clearError(`ingredients.${i}.quantity`);
                      }}
                      aria-invalid={Boolean(errors[`ingredients.${i}.quantity`])}
                    />
                    {err(`ingredients.${i}.quantity`)}
                  </div>
                  <div className={adminStyles.field}>
                    <label htmlFor={`${uid}-${line.key}-u`} className={adminStyles.label}>
                      Unidad
                    </label>
                    <select
                      id={`${uid}-${line.key}-u`}
                      className={`${adminStyles.input} ${styles.select}`}
                      value={line.unit}
                      disabled={!ingredient}
                      onChange={(e) => updateLine(line.key, { unit: e.target.value as MeasureUnit })}
                    >
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {MEASURE_LABELS[u]}
                        </option>
                      ))}
                    </select>
                    {err(`ingredients.${i}.unit`)}
                  </div>
                </div>
                <div className={styles.lineFoot}>
                  {ingredient &&
                    (ingredient.unitCost ? (
                      <span className={styles.lineCost}>{formatUnitCost(ingredient.unitCost, ingredient.baseUnit)}</span>
                    ) : (
                      <span className={styles.warn}>⚠ Falta cargar precio</span>
                    ))}
                  {subtotal !== null && <span className={styles.lineSubtotal}>{formatMoney(subtotal)}</span>}
                  <button type="button" className={styles.linkButton} onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="secondary" className={styles.addButton} onClick={() => setLines((prev) => [...prev, { key: newKey(), ingredientId: "", quantity: "", unit: "G" }])}>
          + Agregar ingrediente
        </Button>
      </section>

      <section className={adminStyles.section}>
        <h2 className={adminStyles.sectionTitle}>Gastos adicionales</h2>
        <p className={adminStyles.sectionLead}>Gas, packaging, sticker, decoración… lo que quieras sumar al costo de la receta.</p>
        <div className={styles.lines}>
          {extras.map((extra, i) => (
            <div key={extra.key} className={styles.line}>
              <div className={styles.row}>
                <div className={adminStyles.field}>
                  <label htmlFor={`${uid}-${extra.key}-n`} className={adminStyles.label}>
                    Concepto
                  </label>
                  <input
                    id={`${uid}-${extra.key}-n`}
                    className={adminStyles.input}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="Ej.: Gas / electricidad"
                    value={extra.name}
                    onChange={(e) => {
                      updateExtra(extra.key, { name: e.target.value });
                      clearError(`extraCosts.${i}.name`);
                    }}
                    aria-invalid={Boolean(errors[`extraCosts.${i}.name`])}
                  />
                  {err(`extraCosts.${i}.name`)}
                </div>
                <div className={adminStyles.field}>
                  <label htmlFor={`${uid}-${extra.key}-a`} className={adminStyles.label}>
                    Monto ($)
                  </label>
                  <input
                    id={`${uid}-${extra.key}-a`}
                    className={adminStyles.input}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Ej.: 500"
                    value={extra.amount}
                    onChange={(e) => {
                      updateExtra(extra.key, { amount: e.target.value });
                      clearError(`extraCosts.${i}.amount`);
                    }}
                    aria-invalid={Boolean(errors[`extraCosts.${i}.amount`])}
                  />
                  {err(`extraCosts.${i}.amount`)}
                </div>
              </div>
              <div className={styles.lineFoot}>
                <span />
                <button type="button" className={styles.linkButton} onClick={() => setExtras((prev) => prev.filter((x) => x.key !== extra.key))}>
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" className={styles.addButton} onClick={() => setExtras((prev) => [...prev, { key: newKey(), name: "", amount: "" }])}>
          + Agregar gasto
        </Button>
      </section>

      <section className={styles.summary} aria-label="Resumen de costos">
        <h2 className={adminStyles.sectionTitle}>Resumen</h2>
        {!complete && (
          <p className={styles.warnBox}>
            <strong>⚠ COSTO INCOMPLETO</strong>
            <br />
            No se puede calcular el costo final porque hay ingredientes sin precio ({missing}).
          </p>
        )}
        <div className={styles.summaryRow}>
          <span>Ingredientes</span>
          <span>{complete ? formatMoney(ingredientsCost) : "—"}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Gastos adicionales</span>
          <span>{formatMoney(extrasCost)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
          <span>Costo total receta</span>
          <span>{complete ? formatMoney(total) : "—"}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Rendimiento</span>
          <span>{validYield ? `${yieldQuantity} ${yieldQuantity === 1 ? "cookie" : "cookies"}` : "—"}</span>
        </div>
        <div className={styles.perCookie}>
          <span className={styles.perCookieLabel}>Costo por cookie</span>
          <span className={styles.perCookieValue}>{complete && validYield ? formatMoney(total / yieldQuantity) : "—"}</span>
        </div>
      </section>

      <div className={`${adminStyles.actions} ${adminStyles.stickyActions}`}>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : recipeId ? "Guardar cambios" : "Crear receta"}
        </Button>
      </div>

      {recipeId && (
        <section className={`${adminStyles.section} ${styles.dangerZone}`}>
          <h2 className={adminStyles.sectionTitle}>Eliminar receta</h2>
          <Button variant="secondary" className={styles.dangerButton} onClick={() => setConfirmDelete(true)}>
            Eliminar receta
          </Button>
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`¿Eliminar receta ${savedName}?`}
        confirmLabel="Eliminar definitivamente"
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => !deleting && setConfirmDelete(false)}
      >
        <p>Esta acción no se puede deshacer.</p>
      </ConfirmDialog>
    </form>
  );
}
