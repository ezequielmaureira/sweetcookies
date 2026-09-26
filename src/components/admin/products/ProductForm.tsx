"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CookieImage } from "@/components/ui/CookieImage";
import {
  AdminApiError,
  adminErrorMessage,
  createProduct,
  getProduct,
  updateProduct,
  type AdminProduct,
  type BoxViewInput,
  type ProductInput,
  type ProductStatus,
} from "@/lib/admin/admin-api";
import { moneyToInput, normalizeMoneyInput } from "@/lib/admin/money-input";
import { uploadProductImage, type UploadKind } from "@/lib/admin/product-upload";
import { formatCents, toCents } from "@/lib/catalog";
import { BoxViewEditor } from "./BoxViewEditor";
import styles from "./Products.module.css";

type FormValues = BoxViewInput & {
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

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

const DEFAULT_BOX: BoxViewInput = { boxImageUrl: null, boxImageScale: 1, boxImageX: 50, boxImageY: 50, boxImageRotation: 0 };

const EMPTY: FormValues = { name: "", category: "Cookies", description: "", price: "", cost: "", stock: "0", imageUrl: "", status: "ACTIVE", featured: false, ...DEFAULT_BOX };

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
    boxImageUrl: p.boxImageUrl,
    boxImageScale: p.boxImageScale,
    boxImageX: p.boxImageX,
    boxImageY: p.boxImageY,
    boxImageRotation: p.boxImageRotation,
  };
}

/** Validación rápida en el cliente; la definitiva la hace el servidor (422 por campo). */
function toInput(values: FormValues): { input: ProductInput } | { errors: FormErrors } {
  const errors: FormErrors = {};
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
      boxImageUrl: values.boxImageUrl,
      boxImageScale: values.boxImageScale,
      boxImageX: values.boxImageX,
      boxImageY: values.boxImageY,
      boxImageRotation: values.boxImageRotation,
    },
  };
}

const LIST_URL = "/admin/productos";

/**
 * Edición completa de un producto (pantalla propia): nombre, descripción,
 * categoría, fotos, vista en caja y demás datos. Precio y stock también están
 * acá, pero el día a día se edita rápido desde la lista.
 */
export function ProductForm({ productId }: { productId: string | null }) {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const isNew = productId === null;
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isNew ? "ready" : "loading");
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadKind | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const mainFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoaded || productId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const product = await getProduct(await getToken(), productId);
        if (cancelled) return;
        setValues(fromProduct(product));
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken, productId]);

  const update = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, form: undefined }));
  };

  const updateBox = (patch: Partial<BoxViewInput>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => ({ ...prev, boxImageUrl: undefined, boxImageScale: undefined, boxImageX: undefined, boxImageY: undefined, boxImageRotation: undefined, form: undefined }));
  };

  const upload = async (file: File, kind: UploadKind): Promise<string | null> => {
    setUploading(kind);
    const field = kind === "main" ? "imageUrl" : "boxImageUrl";
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    const result = await uploadProductImage(getToken, file, kind);
    setUploading(null);
    if ("error" in result) {
      setErrors((prev) => ({ ...prev, [field]: result.error }));
      return null;
    }
    return result.url;
  };

  const handleMainFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const url = await upload(file, "main");
    if (url) update("imageUrl", url);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (uploading) {
      setErrors((prev) => ({ ...prev, form: "Esperá a que termine de subir la imagen." }));
      return;
    }
    const result = toInput(values);
    if ("errors" in result) {
      setErrors({ ...result.errors, form: "Revisá los campos marcados." });
      const first = Object.keys(result.errors)[0];
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const saved = isNew ? await createProduct(token, result.input) : await updateProduct(token, productId, result.input);
      router.push(`${LIST_URL}?guardado=${encodeURIComponent(saved.name)}`);
    } catch (error) {
      setSaving(false);
      if (error instanceof AdminApiError && error.status === 422) setErrors({ ...error.fields, form: "Revisá los campos marcados." });
      else setErrors({ form: adminErrorMessage(error, "No pudimos guardar el producto.") });
    }
  };

  if (loadState === "loading") {
    return (
      <p className={styles.notice} role="status">
        Cargando producto…
      </p>
    );
  }
  if (loadState === "error") {
    return (
      <div className={styles.editorPage}>
        <p className={styles.noticeError} role="alert">
          No pudimos cargar este producto (quizás se eliminó).
        </p>
        <Link href={LIST_URL} className={styles.back}>
          ← Volver a Productos
        </Link>
      </div>
    );
  }

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
    <form ref={formRef} className={styles.editorPage} onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <header className={styles.editorHeader}>
        <Link href={LIST_URL} className={styles.back}>
          ← Productos
        </Link>
        <h1 className={styles.editorTitle}>{isNew ? "Nuevo producto" : values.name || "Editar producto"}</h1>
      </header>

      <div className={styles.editorBody}>
        <div className={styles.editorPreview}>
          <div className={styles.previewImage}>
            <CookieImage key={previewSrc ?? "none"} src={previewSrc} alt="" sizes="260px" placeholderLabel="Sin foto" />
          </div>
          <p className={styles.help}>Foto principal (catálogo)</p>
        </div>

        <div className={styles.editorFields}>
          <fieldset className={styles.group}>
            <legend className={styles.groupTitle}>Datos</legend>
            {field("name", "Nombre", <input {...inputProps("name")} type="text" maxLength={80} value={values.name} onChange={(e) => update("name", e.target.value)} />)}
            {field("category", "Categoría", <input {...inputProps("category")} type="text" maxLength={40} value={values.category} onChange={(e) => update("category", e.target.value)} />)}
            {field(
              "description",
              "Descripción",
              <textarea {...inputProps("description")} className={`${styles.input} ${styles.textarea}`} rows={3} maxLength={400} value={values.description} onChange={(e) => update("description", e.target.value)} />,
            )}
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.groupTitle}>Precio y stock</legend>
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
            <div className={styles.switchRow}>
              <span id={id("featured-label")} className={styles.label}>
                Destacado <span className={styles.help}>(aparece primero en la web)</span>
              </span>
              <button type="button" role="switch" aria-checked={values.featured} aria-labelledby={id("featured-label")} className={styles.miniSwitch} onClick={() => update("featured", !values.featured)}>
                <span className={styles.miniThumb} aria-hidden="true" />
              </button>
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.groupTitle}>Imágenes</legend>
            {field(
              "imageUrl",
              "Foto principal",
              <div className={styles.imageInputRow}>
                <input {...inputProps("imageUrl")} type="text" inputMode="url" placeholder="Subí una foto o pegá una ruta /images/… o URL https" maxLength={500} value={values.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} />
                <input ref={mainFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" tabIndex={-1} onChange={handleMainFile} aria-hidden="true" />
                <button type="button" className={styles.uploadButton} onClick={() => mainFileRef.current?.click()} disabled={uploading !== null}>
                  {uploading === "main" ? "Subiendo…" : "Subir foto"}
                </button>
              </div>,
              "Se usa en el catálogo y en las cards. JPG, PNG o WebP.",
            )}

            <BoxViewEditor
              key={productId ?? "new"}
              imageUrl={previewSrc}
              value={{
                boxImageUrl: values.boxImageUrl,
                boxImageScale: values.boxImageScale,
                boxImageX: values.boxImageX,
                boxImageY: values.boxImageY,
                boxImageRotation: values.boxImageRotation,
              }}
              onChange={updateBox}
              onUpload={(file) => upload(file, "box")}
              uploading={uploading === "box"}
              error={errors.boxImageUrl ?? errors.boxImageScale ?? errors.boxImageX ?? errors.boxImageY ?? errors.boxImageRotation}
            />
          </fieldset>
        </div>
      </div>

      <footer className={styles.editorFooter}>
        {errors.form && (
          <p className={styles.error} role="alert">
            {errors.form}
          </p>
        )}
        <Link href={LIST_URL} className={styles.cancelLink} aria-disabled={saving}>
          Cancelar
        </Link>
        <Button type="submit" disabled={saving || uploading !== null}>
          {saving ? "Guardando…" : isNew ? "Crear producto" : "Guardar cambios"}
        </Button>
      </footer>
    </form>
  );
}
