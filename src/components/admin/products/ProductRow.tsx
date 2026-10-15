"use client";

import Link from "next/link";
import { useId } from "react";
import { CookieImage } from "@/components/ui/CookieImage";
import type { AdminProduct } from "@/lib/admin/admin-api";
import { moneyToInput } from "@/lib/admin/money-input";
import { formatPrice } from "@/lib/catalog";
import { RowMenu } from "./RowMenu";
import styles from "./ProductList.module.css";

export const STATUS_LABELS = { ACTIVE: "Activo", PAUSED: "Pausado", OUT_OF_STOCK: "Sin stock" } as const;

export type QuickField = "price" | "stock";
export type RowDraft = Partial<Record<QuickField, string>>;
export type RowState = { saving?: boolean; error?: string; saved?: boolean };

/** Controles del orden de la web (solo con "Orden de la web" y sin filtros). */
export type RowReorder = {
  position: number;
  total: number;
  disabled: boolean;
  dragging: boolean;
  dragOver: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

type ProductRowProps = {
  product: AdminProduct;
  draft: RowDraft;
  state: RowState;
  onDraft: (field: QuickField, value: string | undefined) => void;
  onSave: (fields: QuickField[]) => void;
  onEdit: () => void;
  onToggleFeatured: () => void;
  onToggleStatus: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  reorder?: RowReorder;
};

/** Fila operativa: precio y stock editables en el lugar, destacado y estado con un toque. */
export function ProductRow({ product, draft, state, onDraft, onSave, onEdit, onToggleFeatured, onToggleStatus, onDuplicate, onDelete, reorder }: ProductRowProps) {
  const uid = useId();
  const editUrl = `/admin/productos/${encodeURIComponent(product.id)}`;
  const priceValue = draft.price ?? moneyToInput(product.price);
  const stockValue = draft.stock ?? String(product.stock);
  const pricePending = draft.price !== undefined;
  const stockPending = draft.stock !== undefined;
  const busy = Boolean(state.saving);
  const paused = product.status === "PAUSED";

  // Enter guarda, Escape descarta. Salir del campo NO guarda.
  const keys = (field: QuickField) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (draft[field] !== undefined) onSave([field]);
    }
    if (event.key === "Escape" && draft[field] !== undefined) {
      event.preventDefault();
      onDraft(field, undefined);
    }
  };

  const setDraft = (field: QuickField, value: string) => {
    const saved = field === "price" ? moneyToInput(product.price) : String(product.stock);
    onDraft(field, value === saved ? undefined : value);
  };

  const stepStock = (delta: number) => {
    const current = Number.parseInt(stockValue, 10);
    setDraft("stock", String(Math.max(0, (Number.isFinite(current) ? current : product.stock) + delta)));
  };

  /** Guardar / Cancelar: en una fila propia, separada de los controles (sin toques accidentales). */
  const actions = (field: QuickField, name: string) => (
    <div className={styles.actions}>
      <button type="button" className={styles.save} onClick={() => onSave([field])} disabled={busy} aria-label={`Guardar ${name} de ${product.name}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Guardar
      </button>
      <button type="button" className={styles.discard} onClick={() => onDraft(field, undefined)} disabled={busy} aria-label={`Cancelar cambio de ${name} de ${product.name}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Cancelar
      </button>
    </div>
  );

  return (
    <li
      className={[
        styles.row,
        paused ? styles.rowPaused : "",
        pricePending || stockPending ? styles.rowPending : "",
        reorder?.dragging ? styles.rowDragging : "",
        reorder?.dragOver ? styles.rowDragOver : "",
      ].join(" ")}
      aria-busy={busy}
      onDragOver={reorder?.onDragOver}
      onDrop={reorder?.onDrop}
    >
      <div className={styles.thumb}>
        <CookieImage key={product.imageUrl ?? "none"} src={product.imageUrl} alt="" sizes="56px" />
      </div>

      <div className={styles.nameCell}>
        <Link href={editUrl} className={styles.name}>
          {product.name}
        </Link>
        <span className={styles.category}>{product.category ?? "Sin categoría"}</span>
        {reorder && (
          <div className={styles.orderControls} role="group" aria-label={`Orden de ${product.name} en la web`}>
            <span
              className={styles.dragHandle}
              draggable={!reorder.disabled}
              onDragStart={reorder.onDragStart}
              onDragEnd={reorder.onDragEnd}
              title="Arrastrá para cambiar el orden"
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16">
                <circle cx="5.5" cy="3.5" r="1.3" />
                <circle cx="10.5" cy="3.5" r="1.3" />
                <circle cx="5.5" cy="8" r="1.3" />
                <circle cx="10.5" cy="8" r="1.3" />
                <circle cx="5.5" cy="12.5" r="1.3" />
                <circle cx="10.5" cy="12.5" r="1.3" />
              </svg>
            </span>
            <span className={styles.orderPosition}>#{reorder.position}</span>
            <button type="button" className={styles.orderButton} onClick={reorder.onMoveUp} disabled={reorder.disabled || reorder.position === 1} aria-label={`Subir ${product.name}`} title="Subir">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className={styles.orderButton} onClick={reorder.onMoveDown} disabled={reorder.disabled || reorder.position === reorder.total} aria-label={`Bajar ${product.name}`} title="Bajar">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className={styles.priceCell}>
        <label htmlFor={`${uid}-price`} className={styles.cellLabel}>
          Precio
        </label>
        <div className={[styles.quick, pricePending ? styles.quickPending : ""].join(" ")}>
          <span className={styles.prefix} aria-hidden="true">
            $
          </span>
          <input
            id={`${uid}-price`}
            className={styles.quickInput}
            type="text"
            inputMode="decimal"
            value={priceValue}
            onChange={(e) => setDraft("price", e.target.value)}
            onKeyDown={keys("price")}
            disabled={busy}
            aria-describedby={pricePending ? `${uid}-pending` : undefined}
          />
        </div>
        {pricePending && actions("price", "el precio")}
      </div>

      <div className={styles.stockCell}>
        <label htmlFor={`${uid}-stock`} className={styles.cellLabel}>
          Stock
        </label>
        <div className={[styles.quick, styles.stockQuick, stockPending ? styles.quickPending : ""].join(" ")}>
          <button type="button" className={styles.step} onClick={() => stepStock(-1)} disabled={busy || Number(stockValue) <= 0} aria-label={`Restar 1 al stock de ${product.name}`}>
            −
          </button>
          <input
            id={`${uid}-stock`}
            className={`${styles.quickInput} ${styles.stockInput}`}
            type="text"
            inputMode="numeric"
            value={stockValue}
            onChange={(e) => setDraft("stock", e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={keys("stock")}
            disabled={busy}
          />
          <button type="button" className={styles.step} onClick={() => stepStock(1)} disabled={busy} aria-label={`Sumar 1 al stock de ${product.name}`}>
            +
          </button>
        </div>
        {stockPending && actions("stock", "el stock")}
      </div>

      <div className={styles.statusCell}>
        <span className={`${styles.status} ${styles[`status${product.displayStatus}`]}`}>{STATUS_LABELS[product.displayStatus]}</span>
        <button
          type="button"
          role="switch"
          aria-checked={!paused}
          aria-label={`${product.name} activo`}
          title={paused ? "Activar" : "Pausar"}
          className={styles.miniSwitch}
          onClick={onToggleStatus}
          disabled={busy}
        >
          <span className={styles.miniThumb} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.starCell}>
        <button
          type="button"
          className={[styles.star, product.featured ? styles.starOn : ""].join(" ")}
          aria-pressed={product.featured}
          aria-label={`Destacado: ${product.name}`}
          title={product.featured ? "Quitar de destacados" : "Destacar"}
          onClick={onToggleFeatured}
          disabled={busy}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2.6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.9l5-.7L10 2.6Z" />
          </svg>
        </button>
      </div>

      <div className={styles.editCell}>
        <Link href={editUrl} className={styles.editButton}>
          Editar
        </Link>
      </div>

      <div className={styles.menuCell}>
        <RowMenu
          label={`Más acciones para ${product.name}`}
          disabled={busy}
          items={[
            { label: "Editar producto", onSelect: onEdit },
            { label: "Duplicar", onSelect: onDuplicate },
            { label: paused ? "Activar" : "Pausar", onSelect: onToggleStatus },
            { label: "Eliminar", onSelect: onDelete, danger: true },
          ]}
        />
      </div>

      {(state.error || state.saved || pricePending || stockPending) && (
        <p id={`${uid}-pending`} className={state.error ? styles.rowError : styles.rowNote} role={state.error ? "alert" : "status"}>
          {state.error ?? (state.saved && !pricePending && !stockPending ? "Guardado ✓" : `Sin guardar · actual: ${pricePending ? formatPrice(product.price) : `stock ${product.stock}`}`)}
        </p>
      )}
    </li>
  );
}
