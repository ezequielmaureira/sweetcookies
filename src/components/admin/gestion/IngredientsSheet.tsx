"use client";

import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import {
  addIngredientPrice,
  createIngredient,
  deleteIngredient,
  deleteIngredientPrice,
  formatDate,
  formatMoney,
  formatPurchase,
  formatUnitCost,
  getIngredient,
  listIngredients,
  parseAmount,
  toApiNumber,
  toBase,
  todayAR,
  updateIngredient,
  updateIngredientPrice,
  type BaseUnit,
  type Ingredient,
  type IngredientDetail,
  type IngredientPrice,
  type MeasureUnit,
} from "@/lib/admin/gestion";
import adminStyles from "../Admin.module.css";
import { BaseUnitChoices } from "./BaseUnitChoices";
import styles from "./Gestion.module.css";

/** Unidad de CADA COMPRA según cómo se mide el ingrediente (el costo se calcula en g / ml / unidad). */
const PURCHASE_UNITS: Record<BaseUnit, MeasureUnit[]> = { GRAM: ["G", "KG"], MILLILITER: ["ML", "L"], UNIT: ["UNIT"] };
const UNIT_LABEL: Partial<Record<MeasureUnit, string>> = { G: "g", KG: "kg", ML: "ml", L: "litro", UNIT: "un" };

const numberFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });
/** "45418.00" → "45418"; "2.5" → "2,5" (como se escribe acá). */
const toInput = (value: string) => String(Number(value)).replace(".", ",");
const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Compras viejas en "paquetes" se muestran / editan en unidades. */
const shownQuantity = (p: IngredientPrice) => (p.purchaseUnit === "PACKAGE" ? p.baseQuantity : p.purchaseQuantity);
const shownUnit = (p: IngredientPrice): MeasureUnit => (p.purchaseUnit === "PACKAGE" ? "UNIT" : p.purchaseUnit);

type Panel = { id: string; kind: "edit" | "price" | "history" | "menu" } | null;
type Notice = { kind: "ok" | "error"; text: string } | null;

/**
 * /admin/gestion/ingredientes como PLANILLA: una fila por ingrediente con
 * precio pagado, cantidad, unidad y costo. Editar (corrige la compra vigente y
 * el nombre), + Precio (nueva compra; la anterior queda en el historial),
 * Historial y ⋮ (eliminar) se abren en la misma fila. Sin fichas.
 */
export function IngredientsSheet() {
  const { getToken, isLoaded } = useAuth();
  const params = useSearchParams();
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // ?abrir=<id> (desde el simulador) abre "+ Precio"; ?nuevo=1 abre "Nuevo ingrediente".
  const [panel, setPanel] = useState<Panel>(() => (params.get("abrir") ? { id: params.get("abrir")!, kind: "price" } : null));
  const [creating, setCreating] = useState(params.get("nuevo") === "1");
  const [notice, setNotice] = useState<Notice>(null);
  const [toDelete, setToDelete] = useState<Ingredient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    const res = await listIngredients(await getToken());
    setIngredients(res.ingredients);
  }, [getToken]);

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
  }, [isLoaded, getToken]);

  const done = async (text: string) => {
    await reload();
    setPanel(null);
    setNotice({ kind: "ok", text });
  };

  const removeIngredient = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteIngredient(await getToken(), toDelete.id);
      await done(`${toDelete.name} eliminado ✓`);
    } catch (e) {
      const inUse = e instanceof AdminApiError && e.status === 409;
      setNotice({ kind: "error", text: inUse ? "Este ingrediente se usa en una receta y no se puede eliminar." : adminErrorMessage(e, "No pudimos eliminar el ingrediente.") });
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  };

  const toggle = (id: string, kind: NonNullable<Panel>["kind"]) => {
    setNotice(null);
    setPanel((p) => (p?.id === id && p.kind === kind ? null : { id, kind }));
  };

  const visible = (ingredients ?? []).filter((i) => normalize(i.name).includes(normalize(q.trim())));

  return (
    <>
      <div className={styles.toolbar}>
        <input type="search" className={`${adminStyles.input} ${styles.search}`} placeholder="Buscar ingrediente" aria-label="Buscar ingrediente" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => setCreating((v) => !v)}>{creating ? "Cerrar" : "+ Nuevo ingrediente"}</Button>
      </div>

      {creating && (
        <NewIngredient
          onCreated={async (created) => {
            setCreating(false);
            await reload();
            // Recién creado: se abre su "+ Precio" para cargar la primera compra.
            setPanel({ id: created.id, kind: "price" });
            setNotice({ kind: "ok", text: `${created.name} creado ✓ Cargá su precio.` });
          }}
        />
      )}

      {notice && (
        <p className={notice.kind === "ok" ? styles.ok : adminStyles.statusError} role={notice.kind === "ok" ? "status" : "alert"} style={{ marginBottom: 12 }}>
          {notice.text}
        </p>
      )}
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

      {visible.length > 0 && (
        <div className={styles.sheet} role="table" aria-label="Ingredientes">
          <div className={`${styles.sheetRow} ${styles.sheetHead}`} role="row">
            <span role="columnheader" className={styles.cName}>Ingrediente</span>
            <span role="columnheader" className={`${styles.cPrice} ${styles.sheetNum}`}>Precio</span>
            <span role="columnheader" className={`${styles.cQty} ${styles.sheetNum}`}>Cantidad</span>
            <span role="columnheader" className={styles.cUnit}>Unidad</span>
            <span role="columnheader" className={`${styles.cCost} ${styles.sheetNum}`}>Costo</span>
            <span role="columnheader" className={`${styles.cActions} ${styles.sheetActionsHead}`}>
              Acciones
            </span>
          </div>
          {visible.map((i) =>
            panel?.id === i.id && panel.kind === "edit" ? (
              <EditRow key={i.id} ingredient={i} onCancel={() => setPanel(null)} onSaved={() => done(`${i.name} guardado ✓`)} />
            ) : (
              <div key={i.id} className={styles.sheetBlock}>
                <div className={styles.sheetRow} role="row">
                  <span role="cell" className={`${styles.cName} ${styles.sheetName}`}>
                    {i.name}
                  </span>
                  {i.currentPrice ? (
                    <>
                      <span role="cell" className={`${styles.cPrice} ${styles.sheetNum}`}>
                        {formatMoney(i.currentPrice.totalPrice)}
                      </span>
                      <span role="cell" className={`${styles.cQty} ${styles.sheetNum}`}>
                        {numberFormat.format(Number(shownQuantity(i.currentPrice)))}
                      </span>
                      <span role="cell" className={styles.cUnit}>{UNIT_LABEL[shownUnit(i.currentPrice)]}</span>
                      <span role="cell" className={`${styles.cCost} ${styles.sheetNum} ${styles.sheetCost}`}>
                        {formatUnitCost(i.currentPrice.unitCost, i.baseUnit)}
                      </span>
                    </>
                  ) : (
                    <span role="cell" className={`${styles.warn} ${styles.sheetNoPrice}`}>
                      ⚠ Sin precio
                    </span>
                  )}
                  <span role="cell" className={`${styles.cActions} ${styles.sheetActions}`}>
                    <button type="button" className={styles.linkButton} onClick={() => toggle(i.id, "edit")}>
                      Editar
                    </button>
                    <button type="button" className={styles.linkButton} onClick={() => toggle(i.id, "price")} aria-expanded={panel?.id === i.id && panel.kind === "price"}>
                      + Precio
                    </button>
                    <button type="button" className={styles.linkButton} onClick={() => toggle(i.id, "history")} aria-expanded={panel?.id === i.id && panel.kind === "history"}>
                      Historial
                    </button>
                    <button type="button" className={styles.linkButton} aria-label={`Más opciones de ${i.name}`} onClick={() => toggle(i.id, "menu")} aria-expanded={panel?.id === i.id && panel.kind === "menu"}>
                      ⋮
                    </button>
                  </span>
                </div>

                {panel?.id === i.id && panel.kind === "price" && (
                  <PriceForm ingredient={i} title={`Nueva compra — ${i.name}`} onCancel={() => setPanel(null)} onSaved={() => done(`Precio de ${i.name} guardado ✓`)} />
                )}
                {panel?.id === i.id && panel.kind === "history" && <History ingredient={i} onClose={() => setPanel(null)} onChanged={reload} />}
                {panel?.id === i.id && panel.kind === "menu" && (
                  <div className={styles.sheetPanel}>
                    {i.recipeCount > 0 ? (
                      <p className={adminStyles.help}>Este ingrediente se usa en {i.recipeCount === 1 ? "una receta" : `${i.recipeCount} recetas`} y no se puede eliminar.</p>
                    ) : (
                      <button type="button" className={`${styles.linkButton} ${styles.dangerLink}`} onClick={() => setToDelete(i)}>
                        Eliminar ingrediente
                      </button>
                    )}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete ? `¿Eliminar ${toDelete.name}?` : ""}
        confirmLabel="Eliminar"
        danger
        busy={deleting}
        onConfirm={() => void removeIngredient()}
        onCancel={() => !deleting && setToDelete(null)}
      >
        <p>Se borra el ingrediente y su historial de precios. No se puede deshacer.</p>
      </ConfirmDialog>
    </>
  );
}

/* ---------- Editar (fila en modo edición: nombre + compra vigente) ---------- */

function EditRow({ ingredient, onSaved, onCancel }: { ingredient: Ingredient; onSaved: () => void; onCancel: () => void }) {
  const { getToken } = useAuth();
  const uid = useId();
  const cp = ingredient.currentPrice;
  const units = PURCHASE_UNITS[ingredient.baseUnit];
  const [name, setName] = useState(ingredient.name);
  const [total, setTotal] = useState(cp ? toInput(cp.totalPrice) : "");
  const [amount, setAmount] = useState(cp ? toInput(shownQuantity(cp)) : "");
  const [unit, setUnit] = useState<MeasureUnit>(cp && units.includes(shownUnit(cp)) ? shownUnit(cp) : units[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const t = parseAmount(total);
  const a = parseAmount(amount);
  const cost = t && a ? t / toBase(a, unit) : null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) return setMessage("Escribí un nombre.");
    const wantsPrice = total.trim() !== "" || amount.trim() !== "";
    if (wantsPrice && (!t || !a || t <= 0 || a <= 0)) return setMessage("Completá precio y cantidad.");
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (name.trim() !== ingredient.name) await updateIngredient(token, ingredient.id, { name: name.trim() });
      if (wantsPrice && t && a) {
        const input = { quantity: toApiNumber(a, 4), unit, totalPrice: toApiNumber(t, 2) };
        const changed = !cp || Number(cp.totalPrice) !== t || Number(shownQuantity(cp)) !== a || shownUnit(cp) !== unit;
        // Editar CORRIGE la compra vigente (misma fecha y proveedor); si no tenía, carga la primera.
        if (cp && changed) await updateIngredientPrice(token, ingredient.id, cp.id, { ...input, purchasedAt: cp.purchasedAt, supplierName: cp.supplierName ?? undefined });
        else if (!cp) await addIngredientPrice(token, ingredient.id, { ...input, purchasedAt: todayAR() });
      }
      onSaved();
    } catch (e) {
      setMessage(adminErrorMessage(e, "No pudimos guardar."));
      setSaving(false);
    }
  };

  return (
    <form className={`${styles.sheetRow} ${styles.sheetEditing}`} onSubmit={save} noValidate role="row">
      <span role="cell" className={styles.cName}>
        <label htmlFor={`${uid}-n`} className={styles.cellLabel}>
          Ingrediente
        </label>
        <input id={`${uid}-n`} className={`${adminStyles.input} ${styles.cellInput}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </span>
      <span role="cell" className={styles.cPrice}>
        <label htmlFor={`${uid}-t`} className={styles.cellLabel}>
          Precio pagado
        </label>
        <input id={`${uid}-t`} className={`${adminStyles.input} ${styles.cellInput}`} inputMode="decimal" autoComplete="off" value={total} onChange={(e) => setTotal(e.target.value)} />
      </span>
      <span role="cell" className={styles.cQty}>
        <label htmlFor={`${uid}-a`} className={styles.cellLabel}>
          Cantidad
        </label>
        <input id={`${uid}-a`} className={`${adminStyles.input} ${styles.cellInput}`} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </span>
      <span role="cell" className={styles.cUnit}>
        <label htmlFor={`${uid}-u`} className={styles.cellLabel}>
          Unidad
        </label>
        <UnitSelect id={`${uid}-u`} units={units} value={unit} onChange={setUnit} />
      </span>
      <span role="cell" className={`${styles.cCost} ${styles.sheetNum} ${styles.sheetCost}`}>
        <span className={styles.cellLabel}>Costo</span>
        {cost !== null ? formatUnitCost(cost, ingredient.baseUnit) : "—"}
      </span>
      <span role="cell" className={`${styles.cActions} ${styles.sheetActions}`}>
        <Button type="submit" disabled={saving}>
          {saving ? "…" : "Guardar"}
        </Button>
        <button type="button" className={styles.linkButton} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </span>
      {message && (
        <p className={`${adminStyles.statusError} ${styles.sheetMessage}`} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}

function UnitSelect({ id, units, value, onChange }: { id: string; units: MeasureUnit[]; value: MeasureUnit; onChange: (u: MeasureUnit) => void }) {
  if (units.length === 1) {
    return (
      <span id={id} className={styles.fixedUnit}>
        unidades
      </span>
    );
  }
  return (
    <select id={id} className={`${adminStyles.input} ${styles.select} ${styles.cellInput}`} value={value} onChange={(e) => onChange(e.target.value as MeasureUnit)}>
      {units.map((u) => (
        <option key={u} value={u}>
          {UNIT_LABEL[u]}
        </option>
      ))}
    </select>
  );
}

/* ---------- + Precio (nueva compra; la anterior queda en el historial) ---------- */

function PriceForm({ ingredient, title, onSaved, onCancel }: { ingredient: Ingredient; title: string; onSaved: () => void; onCancel: () => void }) {
  const { getToken } = useAuth();
  const uid = useId();
  const units = PURCHASE_UNITS[ingredient.baseUnit];
  const [total, setTotal] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<MeasureUnit>(units[0]);
  const [date, setDate] = useState(todayAR());
  const [supplier, setSupplier] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const t = parseAmount(total);
  const a = parseAmount(amount);
  const cost = t && a ? t / toBase(a, unit) : null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!t || !a || t <= 0 || a <= 0) return setMessage("Completá precio y cantidad.");
    setSaving(true);
    setMessage(null);
    try {
      await addIngredientPrice(await getToken(), ingredient.id, {
        quantity: toApiNumber(a, 4),
        unit,
        totalPrice: toApiNumber(t, 2),
        purchasedAt: date || todayAR(),
        supplierName: supplier.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setMessage(adminErrorMessage(e, "No pudimos guardar."));
      setSaving(false);
    }
  };

  return (
    <form className={styles.sheetPanel} onSubmit={save} noValidate>
      <strong className={styles.panelTitle}>{title}</strong>
      <div className={styles.panelGrid}>
        <span>
          <label htmlFor={`${uid}-t`} className={styles.cellLabel}>
            Precio pagado
          </label>
          <input id={`${uid}-t`} className={`${adminStyles.input} ${styles.cellInput}`} inputMode="decimal" autoComplete="off" autoFocus value={total} onChange={(e) => setTotal(e.target.value)} />
        </span>
        <span>
          <label htmlFor={`${uid}-a`} className={styles.cellLabel}>
            Cantidad
          </label>
          <input id={`${uid}-a`} className={`${adminStyles.input} ${styles.cellInput}`} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </span>
        <span>
          <label htmlFor={`${uid}-u`} className={styles.cellLabel}>
            Unidad
          </label>
          <UnitSelect id={`${uid}-u`} units={units} value={unit} onChange={setUnit} />
        </span>
        <span>
          <span className={styles.cellLabel}>Costo</span>
          <strong className={styles.sheetCost}>{cost !== null ? formatUnitCost(cost, ingredient.baseUnit) : "—"}</strong>
        </span>
        <span>
          <label htmlFor={`${uid}-d`} className={styles.cellLabel}>
            Fecha
          </label>
          <input id={`${uid}-d`} type="date" className={`${adminStyles.input} ${styles.cellInput}`} value={date} onChange={(e) => setDate(e.target.value)} />
        </span>
        <span>
          <label htmlFor={`${uid}-s`} className={styles.cellLabel}>
            Proveedor (opcional)
          </label>
          <input id={`${uid}-s`} className={`${adminStyles.input} ${styles.cellInput}`} maxLength={80} autoComplete="off" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </span>
      </div>
      <span className={styles.sheetActions}>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <button type="button" className={styles.linkButton} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </span>
      {message && (
        <p className={adminStyles.statusError} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}

/* ---------- Historial (desplegable) ---------- */

function History({ ingredient, onClose, onChanged }: { ingredient: Ingredient; onClose: () => void; onChanged: () => Promise<void> }) {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<IngredientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<IngredientPrice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getIngredient(await getToken(), ingredient.id);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) setError(adminErrorMessage(e, "No pudimos cargar el historial."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ingredient.id, getToken]);

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      setDetail(await deleteIngredientPrice(await getToken(), ingredient.id, toDelete.id));
      await onChanged();
    } catch (e) {
      setError(adminErrorMessage(e, "No pudimos eliminar la compra."));
    } finally {
      setToDelete(null);
      setBusy(false);
    }
  };

  return (
    <div className={styles.sheetPanel}>
      <span className={styles.panelHead}>
        <strong className={styles.panelTitle}>Historial — {ingredient.name}</strong>
        <button type="button" className={styles.linkButton} onClick={onClose}>
          Cerrar
        </button>
      </span>
      {error && <p className={adminStyles.statusError}>{error}</p>}
      {!detail && !error && <p className={adminStyles.status}>Cargando…</p>}
      {detail && detail.prices.length === 0 && <p className={adminStyles.help}>Sin compras cargadas.</p>}
      {detail && detail.prices.length > 0 && (
        <ul className={styles.historyCompact}>
          {detail.prices.map((p, index) => (
            <li key={p.id}>
              <span>
                {formatDate(p.purchasedAt)}
                {index === 0 && <strong> · actual</strong>}
              </span>
              <span>{formatPurchase(p)}</span>
              <span>{formatMoney(p.totalPrice)}</span>
              <strong>{formatUnitCost(p.unitCost, ingredient.baseUnit)}</strong>
              {p.supplierName && <span className={styles.itemMeta}>{p.supplierName}</span>}
              <button type="button" className={`${styles.linkButton} ${styles.dangerLink}`} onClick={() => setToDelete(p)}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title="¿Eliminar esta compra?"
        confirmLabel="Eliminar compra"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => !busy && setToDelete(null)}
      >
        {toDelete && (
          <p>
            {formatDate(toDelete.purchasedAt)} · {formatPurchase(toDelete)} por {formatMoney(toDelete.totalPrice)}. El precio vigente pasa a la compra más reciente que quede.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

/* ---------- Nuevo ingrediente ---------- */

function NewIngredient({ onCreated }: { onCreated: (created: { id: string; name: string }) => void }) {
  const { getToken } = useAuth();
  const uid = useId();
  const [name, setName] = useState("");
  const [baseUnit, setBaseUnit] = useState<BaseUnit>("GRAM");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) return setMessage("Escribí un nombre.");
    setSaving(true);
    setMessage(null);
    try {
      const created = await createIngredient(await getToken(), { name: name.trim(), baseUnit });
      onCreated({ id: created.id, name: created.name });
    } catch (e) {
      setMessage(adminErrorMessage(e, "No pudimos crear el ingrediente."));
      setSaving(false);
    }
  };

  return (
    <form className={styles.sheetPanel} onSubmit={submit} noValidate style={{ marginBottom: 16 }}>
      <strong className={styles.panelTitle}>Nuevo ingrediente</strong>
      <span>
        <label htmlFor={`${uid}-n`} className={styles.cellLabel}>
          Nombre
        </label>
        <input id={`${uid}-n`} className={`${adminStyles.input} ${styles.cellInput}`} maxLength={80} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </span>
      <fieldset className={styles.plainFieldset}>
        <legend className={styles.cellLabel}>¿Cómo se mide?</legend>
        <BaseUnitChoices name={`${uid}-unit`} value={baseUnit} onChange={setBaseUnit} />
      </fieldset>
      <span className={styles.sheetActions}>
        <Button type="submit" disabled={saving}>
          {saving ? "Creando…" : "Crear"}
        </Button>
      </span>
      {message && (
        <p className={adminStyles.statusError} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
