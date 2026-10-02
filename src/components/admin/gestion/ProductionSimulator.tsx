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

type Line = { key: string; recipeId: string; cookies: number };
/** Qué se mira en ingredientes: una variedad (o el total) y una parte (o todo). No cambia ningún costo. */
type View = "ALL" | RecipeComponent;
type Variety = "TOTAL" | string;

let seq = 0;
const newKey = () => `s${++seq}`;
const MAX_COOKIES = 100000;

/**
 * /admin/gestion/simulador: cuántas cookies de cada receta → ingredientes,
 * costos y promedio, separados en masa / relleno. Solo LEE recetas y precios; no guarda nada (al recargar
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
  const [view, setView] = useState<View>("ALL");
  const [variety, setVariety] = useState<Variety>("TOTAL");
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
  const items = lines.filter((l) => byId.get(l.recipeId)?.yieldQuantity && l.cookies >= 1).map((l) => ({ recipeId: l.recipeId, cookies: l.cookies }));
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
  // Partes con ingredientes en esta producción ("Sin clasificar" solo si existe).
  const parts: RecipeComponent[] = summary && summary.components.UNASSIGNED.lines > 0 ? [...PARTS, "UNASSIGNED"] : [...PARTS];
  const visibleParts = view === "ALL" ? parts : parts.filter((p) => p === view);
  // Si la variedad elegida ya no está en la simulación, se vuelve al total.
  const selected = variety === "TOTAL" ? null : (detailById.get(variety) ?? null);
  const partLabel = (part: RecipeComponent) => COMPONENT_LABELS[part].toLowerCase();
  /** Ingredientes de una parte para la variedad elegida (o el total), con su cantidad y costo. */
  const rowsFor = (part: RecipeComponent) =>
    (shown?.data.ingredients ?? [])
      .filter((i) => i.component === part)
      .flatMap((i) => {
        if (!selected) return [{ ...i, quantity: i.quantity, cost: i.cost }];
        const own = i.byRecipe.find((b) => b.recipeId === selected.recipeId);
        return own ? [{ ...i, quantity: own.quantity, cost: own.cost }] : [];
      });
  /** Subtotal de una parte: de la variedad elegida o de toda la producción (calculado en el servidor). */
  const partSubtotal = (part: RecipeComponent) => (selected ? selected.components[part] : summary!.components[part]);

  return (
    <div className={adminStyles.form}>
      <section className={adminStyles.section}>
        <h2 className={adminStyles.sectionTitle}>Recetas</h2>
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
                      <p className={styles.lineCost}>
                        Rinde {recipe.yieldQuantity} · {line.cookies >= 1 ? `Equivale a ${formatFactor(String(line.cookies / recipe.yieldQuantity!))}` : "Ingresá la cantidad"}
                        {detail && (
                          <>
                            {" · "}
                            <strong className={styles.lineSubtotal}>{detail.totalCost ? formatMoney(detail.totalCost) : `${formatMoney(detail.knownCost)} parcial`}</strong>
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
          <Button variant="secondary" onClick={() => setLines((prev) => [...prev, { key: newKey(), recipeId: "", cookies: 0 }])} disabled={lines.length >= recipes.length}>
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
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Cookies totales</span>
              <span>{summary.totalCookies}</span>
            </div>

            {shown.data.recipes.map((d) => (
              <div key={d.recipeId} className={styles.varietyCard}>
                <span className={styles.itemHead}>
                  <span className={styles.itemName}>{d.name}</span>
                  {d.status === "DRAFT" && <span className={styles.chipWarn}>⚠ Borrador</span>}
                </span>
                <span className={styles.itemMeta}>
                  {d.cookies} {d.cookies === 1 ? "cookie" : "cookies"} · Receta base: {d.yieldQuantity} · Equivale a {formatFactor(d.factor)}
                </span>
                {parts.map((part) => (
                  <div key={part} className={styles.partRow}>
                    <span>{COMPONENT_LABELS[part]}</span>
                    <span>{d.components[part].cost ? formatMoney(d.components[part].cost!) : <span className={styles.warn}>⚠ Incompleto</span>}</span>
                  </div>
                ))}
                {Number(d.extrasCost) > 0 && (
                  <div className={styles.partRow}>
                    <span>Gastos adicionales</span>
                    <span>{formatMoney(d.extrasCost)}</span>
                  </div>
                )}
                <div className={`${styles.partRow} ${styles.varietyTotal}`}>
                  <span>Total {d.name}</span>
                  <span>{d.totalCost ? formatMoney(d.totalCost) : `⚠ ${formatMoney(d.knownCost)} parcial`}</span>
                </div>
                <div className={`${styles.partRow} ${styles.varietyPerCookie}`}>
                  <span>Costo por cookie</span>
                  <span>{d.costPerCookie ? formatMoney(d.costPerCookie) : "—"}</span>
                </div>
              </div>
            ))}

            <div className={styles.perCookie}>
              <span className={styles.perCookieLabel}>Total producción{summary.complete && summary.hasDraft ? " (parcial)" : ""}</span>
              <span className={styles.perCookieValue}>{summary.totalCost ? formatMoney(summary.totalCost) : "—"}</span>
              {!summary.complete && <span className={styles.heroMeta}>Costo parcial conocido: {formatMoney(summary.knownCost)}</span>}
            </div>
          </section>

          <section className={adminStyles.section}>
            <h2 className={adminStyles.sectionTitle}>Ingredientes necesarios</h2>
            <div className={styles.filterBlock}>
              <span className={styles.filterLabel}>Variedad</span>
              <div className={styles.filters} role="group" aria-label="Variedad">
                <button type="button" className={styles.filter} aria-pressed={!selected} onClick={() => setVariety("TOTAL")}>
                  Total
                </button>
                {shown.data.recipes.map((d) => (
                  <button key={d.recipeId} type="button" className={styles.filter} aria-pressed={selected?.recipeId === d.recipeId} onClick={() => setVariety(d.recipeId)}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterBlock}>
              <span className={styles.filterLabel}>Parte</span>
              <div className={styles.filters} role="group" aria-label="Parte">
                {(["ALL", ...parts] as View[]).map((v) => (
                  <button key={v} type="button" className={styles.filter} aria-pressed={view === v} onClick={() => setView(v)}>
                    {v === "ALL" ? "Todo" : COMPONENT_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>

            <h3 className={styles.listTitle}>
              Ingredientes — {selected ? `${selected.name} (${selected.cookies} ${selected.cookies === 1 ? "cookie" : "cookies"})` : "Total"} — {view === "ALL" ? "Todo" : COMPONENT_LABELS[view]}
            </h3>

            {visibleParts.map((part) => {
              const list = rowsFor(part);
              const subtotal = partSubtotal(part);
              if (view === "ALL" && list.length === 0) return null;
              return (
                <div key={part} className={styles.partGroup}>
                  {view === "ALL" && <h4 className={styles.itemName}>{COMPONENT_LABELS[part]}</h4>}
                  {part === "UNASSIGNED" && <p className={styles.warnBox}>Ingredientes sin parte asignada. Clasificalos en la receta (masa o relleno).</p>}
                  {list.length === 0 ? (
                    <p className={adminStyles.help}>
                      {selected ? `${selected.name} no lleva` : "Esta producción no lleva"} ingredientes de {partLabel(part)}.
                    </p>
                  ) : (
                    <ul className={styles.list}>
                      {list.map((i) => (
                        <li key={`${i.component}:${i.ingredientId}`} className={styles.item}>
                          <span className={styles.itemHead}>
                            <span className={styles.itemName}>{i.name}</span>
                            {i.cost ? <span className={styles.cost}>{formatMoney(i.cost)}</span> : <span className={styles.warn}>⚠ SIN PRECIO</span>}
                          </span>
                          <span className={styles.neededQty}>{formatNeeded(i.quantity, i.baseUnit)}</span>
                          {i.unitCost ? (
                            <span className={styles.itemMeta}>Costo actual: {formatUnitCost(i.unitCost, i.baseUnit)}</span>
                          ) : (
                            <Link href={`/admin/gestion/ingredientes?abrir=${i.ingredientId}`} className={styles.inlineLink}>
                              Cargar precio →
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {list.length > 0 && (
                    <p className={styles.partSubtotal}>
                      <span>
                        {selected ? `Costo ${partLabel(part)} ${selected.name}` : view === "ALL" ? `Subtotal ${partLabel(part)}` : `Costo total de ${partLabel(part)}`}
                      </span>
                      <span>{subtotal.cost ? formatMoney(subtotal.cost) : <span className={styles.warn}>⚠ Incompleto</span>}</span>
                    </p>
                  )}
                </div>
              );
            })}

            {view === "ALL" && (
              <p className={`${styles.partSubtotal} ${styles.grandSubtotal}`}>
                <span>{selected ? `Ingredientes ${selected.name}` : "Total ingredientes"}</span>
                <span>
                  {(selected ? selected.missingPrices === 0 : summary.complete) ? (
                    formatMoney(selected ? selected.ingredientsCost : summary.ingredientsCost)
                  ) : (
                    <span className={styles.warn}>⚠ Incompleto</span>
                  )}
                </span>
              </p>
            )}
            <p className={adminStyles.help}>Los filtros solo cambian lo que mirás: el total de la producción es siempre el mismo.</p>
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
