"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CookieImage } from "@/components/ui/CookieImage";
import type { AdminProduct, ProductInput, ProductStatus } from "@/lib/admin/admin-api";
import { moneyToInput, normalizeMoneyInput } from "@/lib/admin/money-input";
import { formatCents, toCents } from "@/lib/catalog";
import styles from "./Products.module.css";

type FormValues = {
  name: string;
  category: string;
  description: string;
  price: string;
  cost: string;
  stock: string;
  imageUrl: string;
  status: ProductStatus;
  featured: boolean;
};

export type EditorErrors = Partial<Record<keyof FormValues | "form", string>>;

const EMPTY: FormValues = { name: "", category: "Cookies", description: "", price: "", cost: "", stock: "0", imageUrl: "", status: "ACTIVE", featured: false };

function fromProduct(p: AdminProduct): FormValues {
  return {
    name: p.name,
    category: p.category ?? "",
    description: p.description ?? "",
    price: moneyToInput(p.price),
    cost: moneyToInput(p.cost),
    stock: String(p.stock),
    imageUrl: p.imageUrl ?? "",
    status: p.status,
    featured: p.featured,
  };
}

/** Validación rápida en el cliente; la definitiva la hace el servidor (422 por campo). */
function toInput(values: FormValues): { input: ProductInput } | { errors: EditorErrors } {
  const errors: EditorErrors = {};
  const price = normalizeMoneyInput(values.price);
  const cost = normalizeMoneyInput(values.cost);
  const stock = Number(values.stock);
  if (!values.name.trim()) errors.name = "Ingresá un nombre.";
  if (price === null) errors.price = "Importe inválido (ej. 5000 o 5.000,50).";
  if (cost === null) errors.cost = "Importe inválido (ej. 2500 o 2.500,50).";
  if (!/^\d+$/.test(values.stock.trim()) || !Number.isInteger(stock)) errors.stock = "Número entero, 0 o más.";
  const image = values.imageUrl.trim();
  if (image && !image.startsWith("/") && !image.startsWith("https://")) errors.imageUrl = "Usá una ruta /images/... o una URL https.";
  if (Object.keys(errors).length || price === null || cost === null) return { errors };
  return {
    input: {
      name: values.name.trim(),
      category: values.category.trim(),
      description: values.description.trim(),
      price,
      cost,
      stock,
      imageUrl: image,
      status: values.status,
      featured: values.featured,
    },
  };
}

type ProductEditorProps = {
  /** null = cerrado · "new" = crear · producto = editar. */
  target: AdminProduct | "new" | null;
  onClose: () => void;
  onSave: (input: ProductInput) => Promise<EditorErrors | null>;
};

export function ProductEditor({ target, onClose, onSave }: ProductEditorProps) {
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<EditorErrors>({});
  const [saving, setSaving] = useState(false);
  const open = target !== null;
  const isNew = target === "new";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Cargar los valores al abrir (solo cuando cambia el producto a editar).
  const targetKey = target === null ? null : target === "new" ? "new" : target.id;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (targetKey !== loadedKey) {
    setLoadedKey(targetKey);
    setValues(target && target !== "new" ? fromProduct(target) : EMPTY);
    setErrors({});
    setSaving(false);
  }

  const update = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, form: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const result = toInput(values);
    if ("errors" in result) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      dialogRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setSaving(true);
    const serverErrors = await onSave(result.input);
    setSaving(false);
    if (serverErrors) setErrors(serverErrors);
  };

  const priceCents = toCents(normalizeMoneyInput(values.price) ?? "");
  const costCents = toCents(normalizeMoneyInput(values.cost) ?? "");
  const margin = priceCents > 0 && normalizeMoneyInput(values.cost) !== null ? priceCents - costCents : null;
  const previewSrc = values.imageUrl.trim().startsWith("/") || values.imageUrl.trim().startsWith("https://") ? values.imageUrl.trim() : null;

  const field = (name: keyof FormValues, label: string, input: React.ReactNode, help?: string) => (
    <div className={styles.field}>
      <label htmlFor={id(name)} className={styles.label}>
        {label}
      </label>
      {input}
      {help && !errors[name] && <p className={styles.help}>{help}</p>}
      {errors[name] && (
        <p id={id(`${name}-error`)} className={styles.error}>
          {errors[name]}
        </p>
      )}
    </div>
  );

  const inputProps = (name: keyof FormValues) => ({
    id: id(name),
    "data-field": name,
    className: styles.input,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? id(`${name}-error`) : undefined,
  });

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={id("title")} onClose={onClose}>
      {open && (
        <form className={styles.editor} onSubmit={handleSubmit} noValidate aria-busy={saving}>
          <header className={styles.editorHeader}>
            <h2 id={id("title")} className={styles.editorTitle}>
              {isNew ? "Nuevo producto" : "Editar producto"}
            </h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className={styles.editorBody}>
            <div className={styles.editorPreview}>
              <div className={styles.previewImage}>
                <CookieImage key={previewSrc ?? "none"} src={previewSrc} alt="" sizes="220px" placeholderLabel="Sin imagen" />
              </div>
            </div>

            <div className={styles.editorFields}>
              {field("name", "Nombre", <input {...inputProps("name")} type="text" maxLength={80} value={values.name} onChange={(e) => update("name", e.target.value)} />)}
              {field("category", "Categoría", <input {...inputProps("category")} type="text" maxLength={40} value={values.category} onChange={(e) => update("category", e.target.value)} />)}
              {field(
                "description",
                "Descripción",
                <textarea {...inputProps("description")} className={`${styles.input} ${styles.textarea}`} rows={3} maxLength={400} value={values.description} onChange={(e) => update("description", e.target.value)} />,
              )}

              <div className={styles.fieldRow}>
                {field("price", "Precio de venta ($)", <input {...inputProps("price")} type="text" inputMode="decimal" placeholder="5000" value={values.price} onChange={(e) => update("price", e.target.value)} />)}
                {field("cost", "Costo ($)", <input {...inputProps("cost")} type="text" inputMode="decimal" placeholder="2500" value={values.cost} onChange={(e) => update("cost", e.target.value)} />)}
              </div>
              <p className={styles.margin} aria-live="polite">
                {margin === null ? "Ganancia por unidad: —" : `Ganancia por unidad: ${formatCents(margin)}`}
                {margin !== null && margin < 0 && <span className={styles.marginWarn}> · el costo supera al precio</span>}
              </p>

              <div className={styles.fieldRow}>
                {field("stock", "Stock", <input {...inputProps("stock")} type="number" inputMode="numeric" min={0} step={1} value={values.stock} onChange={(e) => update("stock", e.target.value)} />, "Con 0 queda “Sin stock” y no se puede comprar.")}
                <div className={styles.field}>
                  <span className={styles.label} id={id("status-label")}>
                    Estado
                  </span>
                  <div className={styles.segmented} role="radiogroup" aria-labelledby={id("status-label")}>
                    {(["ACTIVE", "PAUSED"] as const).map((status) => (
                      <label key={status} className={styles.segment}>
                        <input type="radio" name={id("status")} checked={values.status === status} onChange={() => update("status", status)} />
                        <span>{status === "ACTIVE" ? "Activo" : "Pausado"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {field(
                "imageUrl",
                "Imagen",
                <input {...inputProps("imageUrl")} type="text" inputMode="url" placeholder="/images/cookies/mi-cookie.jpg o https://…" maxLength={500} value={values.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} />,
                "Ruta de una foto del sitio o URL https.",
              )}

              <div className={styles.switchRow}>
                <span id={id("featured-label")} className={styles.label}>
                  Destacado <span className={styles.help}>(aparece primero en la web)</span>
                </span>
                <button type="button" role="switch" aria-checked={values.featured} aria-labelledby={id("featured-label")} className={styles.miniSwitch} onClick={() => update("featured", !values.featured)}>
                  <span className={styles.miniThumb} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <footer className={styles.editorFooter}>
            {errors.form && (
              <p className={styles.error} role="alert">
                {errors.form}
              </p>
            )}
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : isNew ? "Crear producto" : "Guardar cambios"}
            </Button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
