"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminApiError,
  adminErrorMessage,
  createProduct,
  deleteProduct,
  duplicateProduct,
  listProducts,
  updateProduct,
  type AdminProduct,
  type ProductInput,
} from "@/lib/admin/admin-api";
import { ProductCard } from "./ProductCard";
import { ProductEditor, type EditorErrors } from "./ProductEditor";
import styles from "./Products.module.css";

type LoadState = "loading" | "ready" | "error";

/** Mismo orden que el catálogo: destacados primero, después el orden del catálogo. */
const sortProducts = (list: AdminProduct[]) =>
  [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

export function ProductsAdmin() {
  const { getToken, isLoaded } = useAuth();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listProducts(await getToken());
        if (cancelled) return;
        setProducts(sortProducts(list));
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken]);

  useEffect(() => {
    const dialog = confirmRef.current;
    if (!dialog) return;
    if (toDelete && !dialog.open) dialog.showModal();
    if (!toDelete && dialog.open) dialog.close();
  }, [toDelete]);

  const replace = (product: AdminProduct) => setProducts((prev) => sortProducts(prev.map((p) => (p.id === product.id ? product : p))));

  /** Cambio rápido desde la card (destacado / pausar-activar) con vuelta atrás si falla. */
  const quickUpdate = async (product: AdminProduct, patch: Partial<ProductInput>, done: string) => {
    setBusyId(product.id);
    const previous = product;
    replace({ ...product, ...patch } as AdminProduct);
    try {
      replace(await updateProduct(await getToken(), product.id, patch));
      setNotice({ kind: "ok", text: done });
    } catch (error) {
      replace(previous);
      setNotice({ kind: "error", text: adminErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (input: ProductInput): Promise<EditorErrors | null> => {
    try {
      const token = await getToken();
      if (editing === "new") {
        const created = await createProduct(token, input);
        setProducts((prev) => sortProducts([...prev, created]));
        setNotice({ kind: "ok", text: `“${created.name}” creado.` });
      } else if (editing) {
        replace(await updateProduct(token, editing.id, input));
        setNotice({ kind: "ok", text: `“${input.name}” guardado.` });
      }
      setEditing(null);
      return null;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 422) return { ...error.fields, form: "Revisá los campos marcados." };
      return { form: adminErrorMessage(error, "No pudimos guardar el producto.") };
    }
  };

  const handleDuplicate = async (product: AdminProduct) => {
    setBusyId(product.id);
    try {
      const copy = await duplicateProduct(await getToken(), product.id);
      setProducts((prev) => sortProducts([...prev, copy]));
      setNotice({ kind: "ok", text: `Copia creada (pausada): “${copy.name}”.` });
    } catch (error) {
      setNotice({ kind: "error", text: adminErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const product = toDelete;
    if (!product) return;
    setToDelete(null);
    setBusyId(product.id);
    try {
      await deleteProduct(await getToken(), product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setNotice({ kind: "ok", text: `“${product.name}” eliminado. Los pedidos anteriores lo conservan.` });
    } catch (error) {
      setNotice({ kind: "error", text: adminErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const counts = {
    active: products.filter((p) => p.displayStatus === "ACTIVE").length,
    paused: products.filter((p) => p.displayStatus === "PAUSED").length,
    out: products.filter((p) => p.displayStatus === "OUT_OF_STOCK").length,
  };

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.counts}>
          {loadState === "ready"
            ? `${products.length} productos · ${counts.active} activos · ${counts.paused} pausados · ${counts.out} sin stock`
            : " "}
        </p>
        <Button onClick={() => setEditing("new")} disabled={loadState !== "ready"}>
          + Nuevo producto
        </Button>
      </div>

      <p className={notice?.kind === "error" ? styles.noticeError : styles.notice} role={notice?.kind === "error" ? "alert" : "status"}>
        {notice?.text}
      </p>

      {loadState === "loading" && (
        <p className={styles.notice} role="status">
          Cargando productos…
        </p>
      )}
      {loadState === "error" && (
        <p className={styles.noticeError} role="alert">
          No pudimos cargar los productos. Probá recargar la página en unos segundos.
        </p>
      )}
      {loadState === "ready" && products.length === 0 && <p className={styles.empty}>Todavía no hay productos. Creá el primero.</p>}

      {products.length > 0 && (
        <ul className={styles.grid}>
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                busy={busyId === product.id}
                onEdit={() => setEditing(product)}
                onToggleFeatured={() =>
                  quickUpdate(product, { featured: !product.featured }, product.featured ? `“${product.name}” ya no está destacado.` : `“${product.name}” destacado.`)
                }
                onToggleStatus={() =>
                  quickUpdate(
                    product,
                    { status: product.status === "PAUSED" ? "ACTIVE" : "PAUSED" },
                    product.status === "PAUSED" ? `“${product.name}” activado.` : `“${product.name}” pausado: ya no se ve en la web.`,
                  )
                }
                onDuplicate={() => handleDuplicate(product)}
                onDelete={() => setToDelete(product)}
              />
            </li>
          ))}
        </ul>
      )}

      <ProductEditor target={editing} onClose={() => setEditing(null)} onSave={handleSave} />

      <dialog ref={confirmRef} className={styles.confirm} aria-labelledby="confirm-delete-title" onClose={() => setToDelete(null)}>
        {toDelete && (
          <div className={styles.confirmBody}>
            <h2 id="confirm-delete-title" className={styles.editorTitle}>
              ¿Eliminar “{toDelete.name}”?
            </h2>
            <p className={styles.help}>
              Se quita del catálogo. Los pedidos que ya lo incluyen conservan su nombre, precio y costo. Si solo querés ocultarlo, usá “Pausar”.
            </p>
            <div className={styles.confirmActions}>
              <Button variant="secondary" onClick={() => setToDelete(null)}>
                Cancelar
              </Button>
              <button type="button" className={styles.dangerButton} onClick={confirmDelete}>
                Eliminar
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
