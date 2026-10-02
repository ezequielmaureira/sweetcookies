"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import {
  addIngredientPrice,
  deleteIngredient,
  deleteIngredientPrice,
  formatBaseQuantity,
  formatDate,
  formatMoney,
  formatUnitCost,
  getIngredient,
  parseAmount,
  toApiNumber,
  todayAR,
  updateIngredient,
  updateIngredientPrice,
  type BaseUnit,
  type IngredientDetail as Detail,
  type IngredientPrice,
} from "@/lib/admin/gestion";
import adminStyles from "../Admin.module.css";
import { BaseUnitChoices } from "./BaseUnitChoices";
import styles from "./Gestion.module.css";

type Notice = { kind: "ok" | "error"; text: string } | null;

/** /admin/gestion/ingredientes/<id>: costo actual, cargar precio, historial y datos. */
export function IngredientDetail({ id }: { id: string }) {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();
  const justCreated = useSearchParams().get("nuevo") === "1";
  const [ingredient, setIngredient] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPriceForm, setShowPriceForm] = useState(justCreated);
  const [notice, setNotice] = useState<Notice>(justCreated ? { kind: "ok", text: "Ingrediente creado ✓ Ahora cargá su precio." } : null);
  const [priceToDelete, setPriceToDelete] = useState<IngredientPrice | null>(null);
  /** Compra que se está corrigiendo (Editar). Una compra nueva nunca pisa otra. */
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getIngredient(await getToken(), id);
        if (!cancelled) setIngredient(res);
      } catch (e) {
        if (!cancelled) setLoadError(adminErrorMessage(e, "No pudimos cargar el ingrediente."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, getToken, isLoaded]);

  const removePrice = async () => {
    if (!priceToDelete) return;
    setBusy(true);
    try {
      setIngredient(await deleteIngredientPrice(await getToken(), id, priceToDelete.id));
      setNotice({ kind: "ok", text: "Compra eliminada ✓ El costo actual pasa a la compra más reciente que queda." });
      setPriceToDelete(null);
    } catch (e) {
      setNotice({ kind: "error", text: adminErrorMessage(e, "No pudimos eliminar el precio.") });
      setPriceToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const removeIngredient = async () => {
    setBusy(true);
    try {
      await deleteIngredient(await getToken(), id);
      router.replace("/admin/gestion/ingredientes");
    } catch (e) {
      const inUse = e instanceof AdminApiError && e.status === 409;
      setNotice({ kind: "error", text: inUse ? "Este ingrediente se usa en recetas: no se puede eliminar. Podés marcarlo como inactivo." : adminErrorMessage(e, "No pudimos eliminar el ingrediente.") });
      setConfirmDelete(false);
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <>
        <Link href="/admin/gestion/ingredientes" className={adminStyles.back}>
          ← Ingredientes
        </Link>
        <p className={adminStyles.statusError} role="alert">
          {loadError}
        </p>
      </>
    );
  }
  if (!ingredient) {
    return (
      <p className={adminStyles.status} role="status">
        Cargando…
      </p>
    );
  }

  const current = ingredient.prices[0];

  return (
    <div className={adminStyles.form}>
      <header>
        <Link href="/admin/gestion/ingredientes" className={adminStyles.back}>
          ← Ingredientes
        </Link>
        <h1 className={adminStyles.title}>{ingredient.name}</h1>
        {!ingredient.active && <span className={styles.chip}>INACTIVO</span>}
      </header>

      {notice && (
        <p className={notice.kind === "ok" ? styles.ok : adminStyles.statusError} role={notice.kind === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      <div className={styles.hero}>
        <span className={styles.heroLabel}>Precio actual</span>
        <span className={styles.heroValue}>{ingredient.unitCost ? formatUnitCost(ingredient.unitCost, ingredient.baseUnit) : "⚠ Sin precio"}</span>
        <span className={styles.heroMeta}>{current
            ? `Última compra: ${formatBaseQuantity(current.baseQuantity, ingredient.baseUnit)} por ${formatMoney(current.totalPrice)} · ${formatDate(current.purchasedAt)}`
            : "Cargá una compra para calcular el costo."}</span>
      </div>

      {showPriceForm ? (
        <PriceForm
          ingredient={ingredient}
          onCancel={() => setShowPriceForm(false)}
          onSaved={(updated) => {
            setIngredient(updated);
            setShowPriceForm(false);
            setNotice({ kind: "ok", text: "Compra guardada ✓" });
          }}
        />
      ) : (
        <Button
          onClick={() => {
            setShowPriceForm(true);
            setNotice(null);
          }}
        >
          + Cargar precio
        </Button>
      )}

      <section className={adminStyles.section}>
        <h2 className={adminStyles.sectionTitle}>Historial de precios</h2>
        {ingredient.prices.length === 0 ? (
          <p className={adminStyles.help}>Todavía no hay precios cargados.</p>
        ) : (
          <ul className={styles.history}>
            {ingredient.prices.map((p) =>
              editingPriceId === p.id ? (
                <li key={p.id}>
                  <PriceForm
                    ingredient={ingredient}
                    price={p}
                    onCancel={() => setEditingPriceId(null)}
                    onSaved={(updated) => {
                      setIngredient(updated);
                      setEditingPriceId(null);
                      setNotice({ kind: "ok", text: "Compra corregida ✓ El costo se recalculó." });
                    }}
                  />
                </li>
              ) : (
                <li key={p.id} className={`${styles.historyItem} ${p.id === current?.id ? styles.historyCurrent : ""}`}>
                  <span>
                    <strong>{formatDate(p.purchasedAt)}</strong>
                    {p.id === current?.id && " · ACTUAL"}
                  </span>
                  <span className={styles.historyActions}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        setEditingPriceId(p.id);
                        setShowPriceForm(false);
                        setNotice(null);
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" className={styles.linkButton} onClick={() => setPriceToDelete(p)}>
                      Eliminar
                    </button>
                  </span>
                  <strong className={styles.historyPurchase}>
                    {formatBaseQuantity(p.baseQuantity, ingredient.baseUnit)} por {formatMoney(p.totalPrice)}
                  </strong>
                  <span className={styles.historyCost}>{formatUnitCost(p.unitCost, ingredient.baseUnit)}</span>
                  {p.supplierName && <span className={styles.itemMeta}>Proveedor: {p.supplierName}</span>}
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <IngredientSettings ingredient={ingredient} onSaved={(updated) => {
        setIngredient(updated);
        setNotice({ kind: "ok", text: "Cambios guardados ✓" });
      }} />

      <section className={`${adminStyles.section} ${styles.dangerZone}`}>
        <h2 className={adminStyles.sectionTitle}>Eliminar ingrediente</h2>
        {ingredient.recipeCount > 0 ? (
          <p className={styles.warnBox}>
            Este ingrediente se usa en {ingredient.recipeCount} {ingredient.recipeCount === 1 ? "receta" : "recetas"}: no se puede eliminar. Si ya no lo usás, marcalo
            como inactivo.
          </p>
        ) : (
          <>
            <p className={adminStyles.help}>Se borra el ingrediente y todo su historial de precios.</p>
            <Button variant="secondary" className={styles.dangerButton} onClick={() => setConfirmDelete(true)}>
              Eliminar ingrediente
            </Button>
          </>
        )}
      </section>

      <ConfirmDialog
        open={priceToDelete !== null}
        title="¿Eliminar esta compra?"
        confirmLabel="Eliminar compra"
        danger
        busy={busy}
        onConfirm={() => void removePrice()}
        onCancel={() => !busy && setPriceToDelete(null)}
      >
        {priceToDelete && (
          <p>
            {formatDate(priceToDelete.purchasedAt)} · {formatBaseQuantity(priceToDelete.baseQuantity, ingredient.baseUnit)} por {formatMoney(priceToDelete.totalPrice)}. El costo actual pasa a la
            compra más reciente que quede.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={`¿Eliminar ${ingredient.name}?`}
        confirmLabel="Eliminar definitivamente"
        danger
        busy={busy}
        onConfirm={() => void removeIngredient()}
        onCancel={() => !busy && setConfirmDelete(false)}
      >
        <p>Se borra el ingrediente y su historial de precios. Esta acción no se puede deshacer.</p>
      </ConfirmDialog>
    </div>
  );
}

/* ---------- Cargar precio ---------- */

/** Lo que se pregunta según la unidad del ingrediente (nunca se elige unidad). */
const AMOUNT_LABEL: Record<BaseUnit, string> = { GRAM: "Gramos que trae", MILLILITER: "Mililitros que trae", UNIT: "Unidades que trae" };
const AMOUNT_EXAMPLE: Record<BaseUnit, string> = { GRAM: "Ej.: 2500", MILLILITER: "Ej.: 750", UNIT: "Ej.: 30" };
/** La compra se guarda directo en la unidad del ingrediente: g, ml o unidades. */
const BASE_MEASURE = { GRAM: "G", MILLILITER: "ML", UNIT: "UNIT" } as const;

/** Número de la API → como se escribe acá ("45418.00" → "45418", "1.25" → "1,25"). */
const toInput = (value: string) => String(Number(value)).replace(".", ",");

/**
 * Cargar o corregir una compra: solo PRECIO PAGADO y CUÁNTO TRAE (en gramos,
 * mililitros o unidades, según el ingrediente). El costo se calcula solo.
 * Editar abre este mismo formulario y corrige ESA compra (no crea otra).
 */
function PriceForm({ ingredient, price, onSaved, onCancel }: { ingredient: Detail; price?: IngredientPrice; onSaved: (d: Detail) => void; onCancel: () => void }) {
  const { getToken } = useAuth();
  const uid = useId();
  const [total, setTotal] = useState(price ? toInput(price.totalPrice) : "");
  const [amount, setAmount] = useState(price ? toInput(price.baseQuantity) : "");
  const [date, setDate] = useState(price?.purchasedAt ?? todayAR());
  const [supplier, setSupplier] = useState(price?.supplierName ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const t = parseAmount(total);
  const a = parseAmount(amount);
  const unitCost = t && a ? t / a : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const e: Record<string, string> = {};
    if (!t || t <= 0) e.totalPrice = "Ingresá el precio pagado.";
    if (!a || a <= 0) e.quantity = `Ingresá ${AMOUNT_LABEL[ingredient.baseUnit].toLowerCase()}.`;
    if (!date) e.purchasedAt = "Elegí la fecha.";
    setErrors(e);
    if (Object.keys(e).length || !t || !a) return;
    setSaving(true);
    setMessage(null);
    try {
      const input = {
        quantity: toApiNumber(a, 4),
        unit: BASE_MEASURE[ingredient.baseUnit],
        totalPrice: toApiNumber(t, 2),
        purchasedAt: date,
        supplierName: supplier.trim() || undefined,
      };
      const token = await getToken();
      const saved = price ? await updateIngredientPrice(token, ingredient.id, price.id, input) : await addIngredientPrice(token, ingredient.id, input);
      onSaved(saved);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 422) setErrors(err.fields);
      setMessage(adminErrorMessage(err, "No pudimos guardar."));
      setSaving(false);
    }
  };

  const field = (key: string) => (errors[key] ? <p className={adminStyles.error}>{errors[key]}</p> : null);

  return (
    <form className={adminStyles.section} onSubmit={submit} noValidate>
      <h2 className={adminStyles.sectionTitle}>{price ? "Editar compra" : "Cargar precio"}</h2>

      <div className={adminStyles.field}>
        <label htmlFor={`${uid}-t`} className={adminStyles.label}>
          Precio pagado ($)
        </label>
        <input id={`${uid}-t`} className={`${adminStyles.input} ${styles.bigInput}`} inputMode="decimal" autoComplete="off" placeholder="Ej.: 120000" value={total} onChange={(e) => setTotal(e.target.value)} aria-invalid={Boolean(errors.totalPrice)} />
        {field("totalPrice")}
      </div>

      <div className={adminStyles.field}>
        <label htmlFor={`${uid}-a`} className={adminStyles.label}>
          {AMOUNT_LABEL[ingredient.baseUnit]}
        </label>
        <input id={`${uid}-a`} className={`${adminStyles.input} ${styles.bigInput}`} inputMode="decimal" autoComplete="off" placeholder={AMOUNT_EXAMPLE[ingredient.baseUnit]} value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(errors.quantity)} />
        {field("quantity")}
      </div>

      <p className={styles.preview} aria-live="polite">
        Costo calculado: <strong>{unitCost !== null ? formatUnitCost(unitCost, ingredient.baseUnit) : "—"}</strong>
      </p>

      <div className={styles.secondaryFields}>
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-d`} className={adminStyles.label}>
            Fecha
          </label>
          <input id={`${uid}-d`} type="date" className={adminStyles.input} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.purchasedAt)} />
          {field("purchasedAt")}
        </div>
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-s`} className={adminStyles.label}>
            Proveedor (opcional)
          </label>
          <input id={`${uid}-s`} className={adminStyles.input} maxLength={80} autoComplete="off" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          {field("supplierName")}
        </div>
      </div>

      <div className={adminStyles.actions}>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        {message && (
          <p className={adminStyles.statusError} role="alert">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}

/* ---------- Datos del ingrediente ---------- */

function IngredientSettings({ ingredient, onSaved }: { ingredient: Detail; onSaved: (d: Detail) => void }) {
  const { getToken } = useAuth();
  const uid = useId();
  const [name, setName] = useState(ingredient.name);
  const [active, setActive] = useState(ingredient.active);
  const [baseUnit, setBaseUnit] = useState<BaseUnit>(ingredient.baseUnit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Con precios o recetas, cambiar la unidad rompería los cálculos: se bloquea.
  const unitLocked = ingredient.priceCount > 0 || ingredient.recipeCount > 0;
  const dirty = name !== ingredient.name || active !== ingredient.active || baseUnit !== ingredient.baseUnit;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const saved = await updateIngredient(await getToken(), ingredient.id, { name, active, ...(baseUnit !== ingredient.baseUnit ? { baseUnit } : {}) });
      setErrors({});
      onSaved(saved);
    } catch (e) {
      setErrors(e instanceof AdminApiError && e.fields ? e.fields : { form: adminErrorMessage(e, "No pudimos guardar.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={adminStyles.section} onSubmit={submit} noValidate>
      <h2 className={adminStyles.sectionTitle}>Datos</h2>
      <div className={adminStyles.field}>
        <label htmlFor={`${uid}-n`} className={adminStyles.label}>
          Nombre
        </label>
        <input id={`${uid}-n`} className={adminStyles.input} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} />
        {errors.name && <p className={adminStyles.error}>{errors.name}</p>}
      </div>

      <label className={styles.switchRow}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Activo (se puede agregar en recetas nuevas)
      </label>

      <fieldset className={adminStyles.field}>
        <legend className={adminStyles.label}>Unidad base</legend>
        <BaseUnitChoices name={`${uid}-unit`} value={baseUnit} onChange={setBaseUnit} disabled={unitLocked} />
        {unitLocked && <p className={adminStyles.help}>No se puede cambiar: este ingrediente ya tiene precios cargados o se usa en recetas, y cambiarla rompería los cálculos.</p>}
        {errors.baseUnit && <p className={adminStyles.error}>{errors.baseUnit}</p>}
      </fieldset>

      <div className={adminStyles.actions}>
        <Button type="submit" variant="secondary" disabled={saving || !dirty}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        {errors.form && (
          <p className={adminStyles.statusError} role="alert">
            {errors.form}
          </p>
        )}
      </div>
    </form>
  );
}
