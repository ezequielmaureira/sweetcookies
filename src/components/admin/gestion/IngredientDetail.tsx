"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import {
  PURCHASE_UNITS,
  MEASURE_LABELS,
  addIngredientPrice,
  deleteIngredient,
  deleteIngredientPrice,
  formatBaseQuantity,
  formatDate,
  formatMoney,
  formatQuantity,
  formatUnitCost,
  getIngredient,
  parseAmount,
  toApiNumber,
  toBase,
  todayAR,
  updateIngredient,
  type BaseUnit,
  type IngredientDetail as Detail,
  type IngredientPrice,
  type MeasureUnit,
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
      setNotice({ kind: "ok", text: "Precio eliminado ✓ El costo actual pasó al precio anterior." });
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
        <span className={styles.heroLabel}>Costo actual</span>
        <span className={styles.heroValue}>{ingredient.unitCost ? formatUnitCost(ingredient.unitCost, ingredient.baseUnit) : "⚠ Sin precio"}</span>
        <span className={styles.heroMeta}>{ingredient.lastPriceDate
            ? `Último precio: ${formatDate(ingredient.lastPriceDate)}${current?.supplierName ? ` · ${current.supplierName}` : ""}`
            : "Cargá un precio para calcular el costo."}</span>
      </div>

      {showPriceForm ? (
        <PriceForm
          ingredient={ingredient}
          onCancel={() => setShowPriceForm(false)}
          onSaved={(updated) => {
            setIngredient(updated);
            setShowPriceForm(false);
            setNotice({ kind: "ok", text: "Precio guardado ✓" });
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
            {ingredient.prices.map((p) => (
              <li key={p.id} className={`${styles.historyItem} ${p.id === current?.id ? styles.historyCurrent : ""}`}>
                <span>
                  <strong>{formatDate(p.purchasedAt)}</strong>
                  {p.id === current?.id && " · actual"}
                </span>
                <button type="button" className={styles.linkButton} onClick={() => setPriceToDelete(p)}>
                  Eliminar
                </button>
                <span>
                  {formatQuantity(p.purchaseQuantity, p.purchaseUnit)}
                  {p.purchaseUnit === "PACKAGE" && p.unitsPerPackage && ` × ${formatQuantity(p.unitsPerPackage, "UNIT")}`} · {formatMoney(p.totalPrice)}
                </span>
                <span />
                <strong>{formatUnitCost(p.unitCost, ingredient.baseUnit)}</strong>
                <span />
                {p.supplierName && <span className={adminStyles.help}>{p.supplierName}</span>}
              </li>
            ))}
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
        title="¿Eliminar este precio?"
        confirmLabel="Eliminar precio"
        danger
        busy={busy}
        onConfirm={() => void removePrice()}
        onCancel={() => !busy && setPriceToDelete(null)}
      >
        {priceToDelete && (
          <p>
            {formatDate(priceToDelete.purchasedAt)} · {formatQuantity(priceToDelete.purchaseQuantity, priceToDelete.purchaseUnit)} · {formatMoney(priceToDelete.totalPrice)}. El costo
            actual pasa al último precio anterior.
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

function PriceForm({ ingredient, onSaved, onCancel }: { ingredient: Detail; onSaved: (d: Detail) => void; onCancel: () => void }) {
  const { getToken } = useAuth();
  const uid = useId();
  const units = PURCHASE_UNITS[ingredient.baseUnit];
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<MeasureUnit>(units[0]);
  const [perPackage, setPerPackage] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(todayAR());
  const [supplier, setSupplier] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const q = parseAmount(quantity);
  const pp = unit === "PACKAGE" ? parseAmount(perPackage) : 1;
  const t = parseAmount(total);
  const base = q && pp ? toBase(q, unit, pp) : null;
  const unitCost = base && t ? t / base : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const e: Record<string, string> = {};
    if (!q || q <= 0) e.quantity = "Ingresá cuánto compraste.";
    if (unit === "PACKAGE" && (!pp || pp <= 0)) e.unitsPerPackage = "Ingresá cuántas unidades trae cada paquete.";
    if (!t || t <= 0) e.totalPrice = "Ingresá el precio total pagado.";
    if (!date) e.purchasedAt = "Elegí la fecha.";
    setErrors(e);
    if (Object.keys(e).length || !q || !t) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await addIngredientPrice(await getToken(), ingredient.id, {
        quantity: toApiNumber(q, 4),
        unit,
        ...(unit === "PACKAGE" && pp ? { unitsPerPackage: toApiNumber(pp, 4) } : {}),
        totalPrice: toApiNumber(t, 2),
        purchasedAt: date,
        supplierName: supplier.trim() || undefined,
      });
      onSaved(saved);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 422) setErrors(err.fields);
      setMessage(adminErrorMessage(err, "No pudimos guardar el precio."));
      setSaving(false);
    }
  };

  const field = (key: string) => (errors[key] ? <p className={adminStyles.error}>{errors[key]}</p> : null);

  return (
    <form className={adminStyles.section} onSubmit={submit} noValidate>
      <h2 className={adminStyles.sectionTitle}>Cargar precio</h2>
      <p className={adminStyles.sectionLead}>Cargá lo que compraste y cuánto pagaste: el costo por {ingredient.baseUnit === "UNIT" ? "unidad" : ingredient.baseUnit === "GRAM" ? "gramo" : "ml"} se calcula solo.</p>

      <div className={styles.row}>
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-q`} className={adminStyles.label}>
            Cantidad comprada
          </label>
          <input id={`${uid}-q`} className={adminStyles.input} inputMode="decimal" autoComplete="off" placeholder="Ej.: 3" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={Boolean(errors.quantity)} />
          {field("quantity")}
        </div>
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-u`} className={adminStyles.label}>
            Unidad de compra
          </label>
          <select id={`${uid}-u`} className={`${adminStyles.input} ${styles.select}`} value={unit} onChange={(e) => setUnit(e.target.value as MeasureUnit)}>
            {units.map((u) => (
              <option key={u} value={u}>
                {MEASURE_LABELS[u]}
              </option>
            ))}
          </select>
          {field("unit")}
        </div>
      </div>

      {unit === "PACKAGE" && (
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-pp`} className={adminStyles.label}>
            Unidades por paquete
          </label>
          <input id={`${uid}-pp`} className={adminStyles.input} inputMode="decimal" autoComplete="off" placeholder="Ej.: 12" value={perPackage} onChange={(e) => setPerPackage(e.target.value)} aria-invalid={Boolean(errors.unitsPerPackage)} />
          {field("unitsPerPackage")}
        </div>
      )}

      <div className={adminStyles.field}>
        <label htmlFor={`${uid}-t`} className={adminStyles.label}>
          Precio total pagado ($)
        </label>
        <input id={`${uid}-t`} className={adminStyles.input} inputMode="decimal" autoComplete="off" placeholder="Ej.: 87.964" value={total} onChange={(e) => setTotal(e.target.value)} aria-invalid={Boolean(errors.totalPrice)} />
        {field("totalPrice")}
      </div>

      {base !== null && (
        <p className={styles.preview} aria-live="polite">
          Total: {formatBaseQuantity(base, ingredient.baseUnit)}
          {unitCost !== null && (
            <>
              {" "}
              · Costo: <strong>{formatUnitCost(unitCost, ingredient.baseUnit)}</strong>
            </>
          )}
        </p>
      )}

      <div className={styles.row}>
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
          <input id={`${uid}-s`} className={adminStyles.input} maxLength={80} autoComplete="off" placeholder="Ej.: Distribuidora" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          {field("supplierName")}
        </div>
      </div>

      <div className={adminStyles.actions}>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar precio"}
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
