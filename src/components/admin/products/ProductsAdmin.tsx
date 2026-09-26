"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminApiError,
  adminErrorMessage,
  deleteProduct,
  duplicateProduct,
  listProducts,
  updateProduct,
  type AdminProduct,
  type DisplayStatus,
  type ProductInput,
} from "@/lib/admin/admin-api";
import { normalizeMoneyInput } from "@/lib/admin/money-input";
import { ProductRow, type QuickField, type RowDraft, type RowState } from "./ProductRow";
import styles from "./ProductList.module.css";

type LoadState = "loading" | "ready" | "error";
type Sort = "name" | "price" | "stock" | "recent";

const SORT_LABELS: Record<Sort, string> = { name: "Nombre", price: "Precio", stock: "Stock", recent: "Más recientes" };
const STATUS_FILTERS: Record<"" | DisplayStatus, string> = { "": "Todos los estados", ACTIVE: "Activos", PAUSED: "Pausados", OUT_OF_STOCK: "Sin stock" };
const MAX_STOCK = 100_000;

const compare: Record<Sort, (a: AdminProduct, b: AdminProduct) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  price: (a, b) => Number(a.price) - Number(b.price) || a.name.localeCompare(b.name, "es"),
  stock: (a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "es"),
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Valida un cambio rápido antes de mandarlo (el servidor vuelve a validar). */
function quickPatch(draft: RowDraft, fields: QuickField[]): { patch: Partial<ProductInput> } | { error: string } {
  const patch: Partial<ProductInput> = {};
  if (fields.includes("price") && draft.price !== undefined) {
    const price = normalizeMoneyInput(draft.price);
    if (price === null) return { error: "Precio inválido (ej. 4500 o 4.500,50)." };
    patch.price = price;
  }
  if (fields.includes("stock") && draft.stock !== undefined) {
    const stock = Number(draft.stock);
    if (!/^\d+$/.test(draft.stock) || stock > MAX_STOCK) return { error: "El stock debe ser un número entero de 0 en adelante." };
    patch.stock = stock;
  }
  return { patch };
}

/**
 * Productos (gestión rápida): lista compacta para operar muchos productos.
 * Precio y stock se editan en la fila; destacado y pausar/activar con un toque.
 * La edición completa (fotos, descripción, vista en caja) está en "Editar".
 */
export function ProductsAdmin() {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = useId();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(() => {
    const saved = searchParams.get("guardado");
    return saved ? { kind: "ok", text: `“${saved}” guardado.` } : null;
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"" | DisplayStatus>("");
  const [sort, setSort] = useState<Sort>("name");
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const savedTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listProducts(await getToken());
        if (cancelled) return;
        setProducts(list);
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

  const pendingIds = Object.keys(drafts).filter((id) => Object.keys(drafts[id]).length > 0);
  const pendingCount = pendingIds.reduce((sum, id) => sum + Object.keys(drafts[id]).length, 0);

  // Aviso del navegador si se intenta salir con cambios sin guardar.
  useEffect(() => {
    if (pendingCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingCount]);

  useEffect(() => {
    const timers = savedTimers.current;
    return () => Object.values(timers).forEach((t) => window.clearTimeout(t));
  }, []);

  const replace = (product: AdminProduct) => setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
  const setRow = (id: string, state: RowState) => setRowStates((prev) => ({ ...prev, [id]: state }));

  const setDraft = (id: string, field: QuickField, value: string | undefined) => {
    setDrafts((prev) => {
      const next = { ...prev[id] };
      if (value === undefined) delete next[field];
      else next[field] = value;
      return { ...prev, [id]: next };
    });
    setRow(id, {});
  };

  /** Guarda los campos rápidos de una fila con un PATCH parcial ({price} y/o {stock}). */
  const saveRow = async (id: string, fields: QuickField[] = ["price", "stock"]): Promise<boolean> => {
    const draft = drafts[id] ?? {};
    const result = quickPatch(draft, fields);
    if ("error" in result) {
      setRow(id, { error: result.error });
      return false;
    }
    if (Object.keys(result.patch).length === 0) return true;
    setRow(id, { saving: true });
    try {
      const saved = await updateProduct(await getToken(), id, result.patch);
      replace(saved);
      setDrafts((prev) => {
        const next = { ...prev[id] };
        for (const field of fields) delete next[field];
        return { ...prev, [id]: next };
      });
      setRow(id, { saved: true });
      window.clearTimeout(savedTimers.current[id]);
      savedTimers.current[id] = window.setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: {} })), 2500);
      return true;
    } catch (error) {
      const message =
        error instanceof AdminApiError && error.status === 422
          ? (Object.values(error.fields)[0] ?? "Valor inválido.")
          : adminErrorMessage(error, "No pudimos guardar.");
      setRow(id, { error: message });
      return false;
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    let ok = 0;
    for (const id of pendingIds) if (await saveRow(id)) ok++;
    setSavingAll(false);
    setNotice(
      ok === pendingIds.length
        ? { kind: "ok", text: `Cambios guardados en ${ok} ${ok === 1 ? "producto" : "productos"}.` }
        : { kind: "error", text: "Algunos cambios no se guardaron: revisá las filas marcadas." },
    );
  };

  const discardAll = () => {
    setDrafts({});
    setRowStates({});
  };

  /** Destacado / pausar-activar: se guarda al toque (con vuelta atrás si falla). */
  const quickToggle = async (product: AdminProduct, patch: Partial<ProductInput>, done: string) => {
    setRow(product.id, { saving: true });
    replace({ ...product, ...patch } as AdminProduct);
    try {
      replace(await updateProduct(await getToken(), product.id, patch));
      setRow(product.id, {});
      setNotice({ kind: "ok", text: done });
    } catch (error) {
      replace(product);
      setRow(product.id, { error: adminErrorMessage(error) });
    }
  };

  const handleDuplicate = async (product: AdminProduct) => {
    setRow(product.id, { saving: true });
    try {
      const copy = await duplicateProduct(await getToken(), product.id);
      setProducts((prev) => [...prev, copy]);
      setNotice({ kind: "ok", text: `Copia creada (pausada): “${copy.name}”.` });
    } catch (error) {
      setNotice({ kind: "error", text: adminErrorMessage(error) });
    } finally {
      setRow(product.id, {});
    }
  };

  const confirmDelete = async () => {
    const product = toDelete;
    if (!product) return;
    setToDelete(null);
    setRow(product.id, { saving: true });
    try {
      await deleteProduct(await getToken(), product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setNotice({ kind: "ok", text: `“${product.name}” eliminado. Los pedidos anteriores lo conservan.` });
    } catch (error) {
      setRow(product.id, { error: adminErrorMessage(error) });
    }
  };

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return products
      .filter((p) => !q || normalize(`${p.name} ${p.category ?? ""} ${p.description ?? ""}`).includes(q))
      .filter((p) => !category || p.category === category)
      .filter((p) => !status || p.displayStatus === status)
      .sort(compare[sort]);
  }, [products, query, category, status, sort]);

  const counts = {
    active: products.filter((p) => p.displayStatus === "ACTIVE").length,
    paused: products.filter((p) => p.displayStatus === "PAUSED").length,
    out: products.filter((p) => p.displayStatus === "OUT_OF_STOCK").length,
  };
  const filtered = Boolean(query || category || status);

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.counts}>
          {loadState === "ready" ? `${products.length} productos · ${counts.active} activos · ${counts.paused} pausados · ${counts.out} sin stock` : " "}
        </p>
        <Link href="/admin/productos/nuevo" className={styles.newButton}>
          + Nuevo producto
        </Link>
      </div>

      <form className={styles.filters} role="search" onSubmit={(e) => e.preventDefault()}>
        <div className={`${styles.filter} ${styles.searchFilter}`}>
          <label htmlFor={`${uid}-q`} className={styles.filterLabel}>
            Buscar producto
          </label>
          <input id={`${uid}-q`} type="search" className={styles.input} placeholder="Nombre, categoría o descripción" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className={styles.filter}>
          <label htmlFor={`${uid}-cat`} className={styles.filterLabel}>
            Categoría
          </label>
          <select id={`${uid}-cat`} className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filter}>
          <label htmlFor={`${uid}-status`} className={styles.filterLabel}>
            Estado
          </label>
          <select id={`${uid}-status`} className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as "" | DisplayStatus)}>
            {(Object.keys(STATUS_FILTERS) as ("" | DisplayStatus)[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_FILTERS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filter}>
          <label htmlFor={`${uid}-sort`} className={styles.filterLabel}>
            Ordenar por
          </label>
          <select id={`${uid}-sort`} className={styles.input} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </form>

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
      {loadState === "ready" && visible.length === 0 && (
        <p className={styles.empty}>{filtered ? "No hay productos con esos filtros." : "Todavía no hay productos. Creá el primero."}</p>
      )}

      {visible.length > 0 && (
        <ul className={styles.list} aria-label="Productos">
          <li className={styles.headRow} aria-hidden="true">
            <span />
            <span>Producto</span>
            <span>Precio</span>
            <span>Stock</span>
            <span>Estado</span>
            <span>Dest.</span>
            <span />
            <span />
          </li>
          {visible.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              draft={drafts[product.id] ?? {}}
              state={rowStates[product.id] ?? {}}
              onDraft={(field, value) => setDraft(product.id, field, value)}
              onSave={(fields) => void saveRow(product.id, fields)}
              onEdit={() => router.push(`/admin/productos/${encodeURIComponent(product.id)}`)}
              onToggleFeatured={() =>
                quickToggle(product, { featured: !product.featured }, product.featured ? `“${product.name}” ya no está destacado.` : `“${product.name}” destacado.`)
              }
              onToggleStatus={() =>
                quickToggle(
                  product,
                  { status: product.status === "PAUSED" ? "ACTIVE" : "PAUSED" },
                  product.status === "PAUSED" ? `“${product.name}” activado.` : `“${product.name}” pausado: ya no se ve en la web.`,
                )
              }
              onDuplicate={() => handleDuplicate(product)}
              onDelete={() => setToDelete(product)}
            />
          ))}
        </ul>
      )}

      {pendingCount > 0 && (
        <div className={styles.pendingBar} role="region" aria-label="Cambios sin guardar">
          <p>
            <strong>{pendingCount}</strong> {pendingCount === 1 ? "cambio sin guardar" : "cambios sin guardar"}
          </p>
          <div className={styles.pendingActions}>
            <button type="button" className={styles.discardAll} onClick={discardAll} disabled={savingAll}>
              Descartar
            </button>
            <Button onClick={saveAll} disabled={savingAll}>
              {savingAll ? "Guardando…" : "Guardar todo"}
            </Button>
          </div>
        </div>
      )}

      <dialog ref={confirmRef} className={styles.confirmDialog} aria-labelledby={`${uid}-delete-title`} onClose={() => setToDelete(null)}>
        {toDelete && (
          <div className={styles.confirmBody}>
            <h2 id={`${uid}-delete-title`} className={styles.confirmTitle}>
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
