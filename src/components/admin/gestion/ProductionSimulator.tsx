"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import {
  COMPONENT_LABELS,
  PARTS,
  formatFactor,
  formatMoney,
  formatNeeded,
  formatUnitCost,
  listRecipes,
  simulateProduction,
  type Recipe,
  type RecipeComponent,
  type SimulationResult,
} from "@/lib/admin/gestion";
import adminStyles from "../Admin.module.css";
import styles from "./Gestion.module.css";

/** required = partes que FALTA preparar (por defecto: masa, relleno y terminación). */
type Line = { key: string; recipeId: string; cookies: number; required: RecipeComponent[] };

let seq = 0;
const newKey = () => `s${++seq}`;
const MAX_COOKIES = 100000;

/**
 * /admin/gestion/simulador: cuántas cookies de cada receta → ingredientes,
 * costos y promedio. Solo LEE recetas y precios; no guarda nada (al recargar
 * empieza vacío). El cálculo lo hace el servidor con Decimal, con los costos
 * actuales; acá solo se muestra.
 */
export function ProductionSimulator() {
  const { getToken, isLoaded } = useAuth();
  const uid = useId();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<{ key: string; data: SimulationResult } | null>(null);
  const [simError, setSimError] = useState<{ key: string; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [ingredientView, setIngredientView] = useState<"pending" | "all">("pending");
  const requestId = useRef(0);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await listRecipes(await getToken());
        if (!cancelled) setRecipes(res.recipes);
      } catch (e) {
        if (!cancelled) setLoadError(adminErrorMessage(e, "No pudimos cargar las recetas."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  const byId = new Map((recipes ?? []).map((r) => [r.id, r]));
  // Solo entran al cálculo las líneas con receta, rendimiento definido y cantidad ≥ 1.
  const items = lines
    .filter((l) => byId.get(l.recipeId)?.yieldQuantity && l.cookies >= 1)
    .map((l) => ({ recipeId: l.recipeId, cookies: l.cookies, requiredComponents: PARTS.filter((c) => l.required.includes(c)) }));
  const itemsKey = JSON.stringify(items);

  // Recalcula solo, con una pequeña espera mientras se escribe.
  useEffect(() => {
    if (!isLoaded || itemsKey === "[]") return;
    const current = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const data = await simulateProduction(await getToken(), JSON.parse(itemsKey));
        if (current === requestId.current) {
          setResult({ key: itemsKey, data });
          setSimError(null);
        }
      } catch (e) {
        if (current === requestId.current) setSimError({ key: itemsKey, text: adminErrorMessage(e, "No pudimos calcular la simulación.") });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [itemsKey, getToken, isLoaded]);

  if (loadError) {
    return (
      <p className={adminStyles.statusError} role="alert">
        {loadError}
      </p>
    );
  }
  if (!recipes) {
    return (
      <p className={adminStyles.status} role="status">
        Cargando recetas…
      </p>
    );
  }

  const update = (key: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setCookies = (key: string, value: number) => update(key, { cookies: Math.max(0, Math.min(MAX_COOKIES, Math.round(value) || 0)) });
  const shown = items.length > 0 ? result : null;
  const updating = shown !== null && shown.key !== itemsKey;
  const detailById = new Map((shown?.data.recipes ?? []).map((d) => [d.recipeId, d]));
  const summary = shown?.data.summary;
  const toggleRequired = (line: Line, part: RecipeComponent) =>
    update(line.key, { required: line.required.includes(part) ? line.required.filter((c) => c !== part) : [...line.required, part] });
  const pendingIngredients = (shown?.data.ingredients ?? []).filter((i) => Number(i.pendingQuantity) > 0);

  return (
    <div className={adminStyles.form}>
      <section className={adminStyles.section}>
        <h2 className={adminStyles.sectionTitle}>¿Qué vas a preparar?</h2>
        {recipes.length === 0 && (
          <p className={styles.warnBox}>
            Todavía no hay recetas. <Link href="/admin/gestion/recetas/nueva">Creá una receta</Link> para poder simular.
          </p>
        )}

        <div className={styles.lines}>
          {lines.map((line) => {
            const recipe = byId.get(line.recipeId);
            const usedElsewhere = new Set(lines.filter((l) => l.key !== line.key).map((l) => l.recipeId));
            const options = recipes.filter((r) => !usedElsewhere.has(r.id));
            const detail = detailById.get(line.recipeId);
            const noYield = recipe && !recipe.yieldQuantity;
            return (
              <div key={line.key} className={styles.line}>
                <div className={adminStyles.field}>
                  <label htmlFor={`${uid}-${line.key}-r`} className={adminStyles.label}>
                    Receta
                  </label>
                  <select
                    id={`${uid}-${line.key}-r`}
                    className={`${adminStyles.input} ${styles.select}`}
                    value={line.recipeId}
                    onChange={(e) => {
                      const next = byId.get(e.target.value);
                      // Al elegir una receta, se propone su rendimiento como cantidad inicial.
                      update(line.key, { recipeId: e.target.value, cookies: line.cookies || next?.yieldQuantity || 1 });
                    }}
                  >
                    <option value="">Elegí una receta</option>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.status === "DRAFT" ? " · ⚠ Borrador" : ""}
                        {!r.yieldQuantity ? " · sin rendimiento" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {noYield ? (
                  <p className={styles.warnBox}>
                    Definí primero el rendimiento de esta receta para poder simularla.{" "}
                    <Link href={`/admin/gestion/recetas/${recipe.id}`}>Editar receta</Link>
                  </p>
                ) : (
                  recipe && (
                    <>
                      {recipe.status === "DRAFT" && <p className={styles.warnBox}>⚠ Esta receta todavía está incompleta. La simulación puede no incluir todos los ingredientes.</p>}
                      <div className={styles.stepperRow}>
                        <span className={adminStyles.label} id={`${uid}-${line.key}-c`}>
                          Cookies
                        </span>
                        <div className={styles.stepper} role="group" aria-labelledby={`${uid}-${line.key}-c`}>
                          <button type="button" className={styles.stepButton} aria-label="Una cookie menos" onClick={() => setCookies(line.key, line.cookies - 1)} disabled={line.cookies <= 1}>
                            −
                          </button>
                          <input
                            className={`${adminStyles.input} ${styles.stepInput}`}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            aria-label="Cantidad de cookies"
                            value={line.cookies ? String(line.cookies) : ""}
                            onChange={(e) => setCookies(line.key, Number(e.target.value.replace(/\D/g, "")))}
                          />
                          <button type="button" className={styles.stepButton} aria-label="Una cookie más" onClick={() => setCookies(line.key, line.cookies + 1)}>
                            +
                          </button>
                        </div>
                      </div>
                      <fieldset className={styles.partsFieldset}>
                        <legend className={adminStyles.label}>Necesito preparar</legend>
                        <div className={styles.partToggles}>
                          {PARTS.map((part) => (
                            <label key={part} className={styles.partToggle}>
                              <input type="checkbox" checked={line.required.includes(part)} onChange={() => toggleRequired(line, part)} />
                              {COMPONENT_LABELS[part]}
                            </label>
                          ))}
                        </div>
                        {PARTS.filter((part) => !line.required.includes(part)).map((part) => (
                          <p key={part} className={styles.ready}>
                            ✓ {COMPONENT_LABELS[part]} ya preparad{part === "FILLING" ? "o" : "a"}
                          </p>
                        ))}
                      </fieldset>
                      <p className={styles.lineCost}>
                        Rinde {recipe.yieldQuantity} · {line.cookies >= 1 ? `Equivale a ${formatFactor(String(line.cookies / recipe.yieldQuantity!))}` : "Ingresá la cantidad"}
                        {detail && (
                          <>
                            {" · "}
                            <strong className={styles.lineSubtotal}>{detail.totalCost ? formatMoney(detail.totalCost) : `${formatMoney(detail.knownCost)} parcial`}</strong>
                            {detail.requiredComponents.length < PARTS.length && <> · pendiente {detail.pendingCost ? formatMoney(detail.pendingCost) : "⚠ incompleto"}</>}
                          </>
                        )}
                      </p>
                    </>
                  )
                )}

                <div className={styles.lineFoot}>
                  <span />
                  <button type="button" className={styles.linkButton} onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className={adminStyles.actions}>
          <Button variant="secondary" onClick={() => setLines((prev) => [...prev, { key: newKey(), recipeId: "", cookies: 0, required: [...PARTS] }])} disabled={lines.length >= recipes.length}>
            + Agregar receta
          </Button>
          {lines.length > 0 && (
            <Button variant="secondary" className={styles.dangerButton} onClick={() => setConfirmClear(true)}>
              Limpiar simulación
            </Button>
          )}
        </div>
      </section>

      {simError && simError.key === itemsKey && items.length > 0 && (
        <p className={adminStyles.statusError} role="alert">
          {simError.text}
        </p>
      )}
      {items.length > 0 && !shown && !simError && (
        <p className={adminStyles.status} role="status">
          Calculando…
        </p>
      )}

      {shown && summary && (
        <div className={styles.lines} aria-busy={updating} style={updating ? { opacity: 0.6 } : undefined}>
          <section className={adminStyles.section}>
            <h2 className={adminStyles.sectionTitle}>Detalle por receta</h2>
            <ul className={styles.list}>
              {shown.data.recipes.map((d) => (
                <li key={d.recipeId} className={styles.item}>
                  <span className={styles.itemHead}>
                    <span className={styles.itemName}>{d.name}</span>
                    {d.status === "DRAFT" && <span className={styles.chipWarn}>⚠ Borrador</span>}
                  </span>
                  <span className={styles.itemMeta}>
                    {d.cookies} cookies · Receta base: {d.yieldQuantity} cookies · Equivale a {formatFactor(d.factor)}
                  </span>
                  <span className={styles.itemMeta}>Costo receta base: {d.baseCost ? formatMoney(d.baseCost) : "⚠ incompleto"}</span>
                  <span className={styles.partList}>
                    {(Object.keys(COMPONENT_LABELS) as RecipeComponent[])
                      .filter((c) => d.components[c].lines > 0)
                      .map((c) => (
                        <span key={c} className={styles.partRow}>
                          <span>{COMPONENT_LABELS[c]}</span>
                          <span>{d.components[c].cost ? formatMoney(d.components[c].cost!) : <span className={styles.warn}>⚠ Incompleto</span>}</span>
                          <span className={d.components[c].pending ? styles.partPending : styles.partReady}>{d.components[c].pending ? "Pendiente" : "✓ Ya preparada"}</span>
                        </span>
                      ))}
                  </span>
                  {d.totalCost ? (
                    <span className={styles.cost}>
                      {formatMoney(d.totalCost)} · {formatMoney(d.costPerCookie!)} por cookie
                    </span>
                  ) : (
                    <span className={styles.warn}>
                      ⚠ Costo parcial {formatMoney(d.knownCost)} (faltan {d.missingPrices} {d.missingPrices === 1 ? "precio" : "precios"})
                    </span>
                  )}
                  {Number(d.extrasCost) > 0 && <span className={styles.itemMeta}>Incluye gastos adicionales: {formatMoney(d.extrasCost)}</span>}
                  <span className={styles.itemMeta}>
                    Total real {d.totalCost ? formatMoney(d.totalCost) : `${formatMoney(d.knownCost)} parcial`} · Pendiente{" "}
                    {d.pendingCost ? formatMoney(d.pendingCost) : `⚠ ${formatMoney(d.pendingKnownCost)} parcial`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={adminStyles.section}>
            <h2 className={adminStyles.sectionTitle}>Ingredientes</h2>
            <div className={styles.filters} role="group" aria-label="Ver ingredientes">
              <button type="button" className={styles.filter} aria-pressed={ingredientView === "pending"} onClick={() => setIngredientView("pending")}>
                Pendientes de preparar ({pendingIngredients.length})
              </button>
              <button type="button" className={styles.filter} aria-pressed={ingredientView === "all"} onClick={() => setIngredientView("all")}>
                Necesarios totales ({shown.data.ingredients.length})
              </button>
            </div>
            <p className={adminStyles.help}>
              {ingredientView === "pending"
                ? "Solo lo que falta preparar: no incluye las partes marcadas como ya preparadas."
                : "Todo lo que lleva la producción completa, incluidas las partes ya preparadas."}
            </p>
            {ingredientView === "pending" && pendingIngredients.length === 0 && <p className={styles.empty}>No falta preparar nada: todas las partes están listas.</p>}
            <ul className={styles.list}>
              {(ingredientView === "pending" ? pendingIngredients : shown.data.ingredients).map((i) => {
                const quantity = ingredientView === "pending" ? i.pendingQuantity : i.quantity;
                const cost = ingredientView === "pending" ? i.pendingCost : i.cost;
                return (
                  <li key={i.ingredientId} className={styles.item}>
                    <span className={styles.itemHead}>
                      <span className={styles.itemName}>{i.name}</span>
                      {cost ? <span className={styles.cost}>{formatMoney(cost)}</span> : <span className={styles.warn}>⚠ SIN PRECIO</span>}
                    </span>
                    <span className={styles.neededQty}>{formatNeeded(quantity, i.baseUnit)}</span>
                    {i.unitCost ? (
                      <span className={styles.itemMeta}>Costo actual: {formatUnitCost(i.unitCost, i.baseUnit)}</span>
                    ) : (
                      <Link href={`/admin/gestion/ingredientes/${i.ingredientId}`} className={styles.inlineLink}>
                        Cargar precio →
                      </Link>
                    )}
                    {shown.data.recipes.length > 1 && <span className={styles.itemMeta}>Para: {i.usedIn.join(", ")}</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.summary} aria-label="Resumen de producción">
            <h2 className={adminStyles.sectionTitle}>Resumen de producción</h2>
            {summary.hasDraft && (
              <p className={styles.warnBox}>
                <strong>⚠ SIMULACIÓN INCOMPLETA</strong>
                <br />
                Incluye recetas en borrador: puede no tener todos los ingredientes.
              </p>
            )}
            {!summary.complete && (
              <p className={styles.warnBox}>
                <strong>⚠ COSTO INCOMPLETO</strong>
                <br />
                Faltan precios para calcular el costo total ({summary.missingPrices} {summary.missingPrices === 1 ? "ingrediente" : "ingredientes"}).
              </p>
            )}
            <div className={styles.summaryRow}>
              <span>Cookies totales</span>
              <span>{summary.totalCookies}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Ingredientes{summary.complete ? "" : " (con precio)"}</span>
              <span>{formatMoney(summary.ingredientsCost)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Gastos adicionales</span>
              <span>{formatMoney(summary.extrasCost)}</span>
            </div>
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>{summary.complete ? (summary.hasDraft ? "Costo total real (parcial)" : "Costo total real") : "Costo parcial conocido"}</span>
              <span>{formatMoney(summary.complete ? summary.totalCost! : summary.knownCost)}</span>
            </div>
            <div className={styles.perCookie}>
              <span className={styles.perCookieLabel}>Costo promedio por cookie{summary.hasDraft && summary.complete ? " (parcial)" : ""}</span>
              <span className={styles.perCookieValue}>{summary.averagePerCookie ? formatMoney(summary.averagePerCookie) : "—"}</span>
            </div>
            <p className={adminStyles.help}>Promedio general de toda la producción. Cada sabor tiene su propio costo en el detalle por receta.</p>
            <div className={styles.pendingBox}>
              <span className={styles.perCookieLabel}>Costo pendiente de producción</span>
              <span className={styles.pendingValue}>{summary.pendingCost ? formatMoney(summary.pendingCost) : `⚠ ${formatMoney(summary.pendingKnownCost)} parcial`}</span>
              <span className={adminStyles.help}>
                Solo los ingredientes de las partes que falta preparar. Las partes ya preparadas siguen dentro del costo total real.
                {Number(summary.extrasCost) > 0 && " Los gastos adicionales van en el costo total."}
              </span>
            </div>
            {summary.hasUnassigned && (
              <p className={styles.warnBox}>Hay ingredientes “Sin clasificar” en alguna receta: se cuentan siempre como pendientes. Clasificalos en la receta.</p>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="¿Limpiar la simulación?"
        confirmLabel="Limpiar"
        onConfirm={() => {
          setLines([]);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      >
        <p>Se quitan todas las recetas cargadas. No se modifica ninguna receta ni precio.</p>
      </ConfirmDialog>
    </div>
  );
}
