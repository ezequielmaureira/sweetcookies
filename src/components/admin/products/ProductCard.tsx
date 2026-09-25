"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CookieImage } from "@/components/ui/CookieImage";
import type { AdminProduct } from "@/lib/admin/admin-api";
import { formatPrice } from "@/lib/catalog";
import styles from "./Products.module.css";

export const STATUS_LABELS = { ACTIVE: "Activo", PAUSED: "Pausado", OUT_OF_STOCK: "Sin stock" } as const;

type ProductCardProps = {
  product: AdminProduct;
  busy: boolean;
  onEdit: () => void;
  onToggleFeatured: () => void;
  onToggleStatus: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

/** Card administrativa: imagen grande, datos clave, "Destacado", "Editar" y menú ⋯. */
export function ProductCard({ product, busy, onEdit, onToggleFeatured, onToggleStatus, onDuplicate, onDelete }: ProductCardProps) {
  const uid = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const paused = product.status === "PAUSED";

  // Cerrar el menú con clic afuera o Escape (devolviendo el foco al botón).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const run = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <article className={[styles.card, paused ? styles.cardPaused : ""].join(" ")} aria-busy={busy}>
      <div className={styles.media}>
        <CookieImage
          key={product.imageUrl ?? "none"}
          src={product.imageUrl}
          alt=""
          sizes="(min-width: 1200px) 300px, (min-width: 640px) 45vw, 92vw"
          placeholderLabel="Sin imagen"
        />
        <span className={`${styles.status} ${styles[`status${product.displayStatus}`]}`}>{STATUS_LABELS[product.displayStatus]}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.heading}>
          <div className={styles.titleBlock}>
            {product.category && <p className={styles.category}>{product.category}</p>}
            <h2 className={styles.name}>{product.name}</h2>
          </div>

          <div className={styles.menuWrap}>
            <button
              ref={triggerRef}
              type="button"
              className={styles.kebab}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={`${uid}-menu`}
              aria-label={`Más acciones para ${product.name}`}
              onClick={() => setMenuOpen((open) => !open)}
              disabled={busy}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="4.5" r="1.6" />
                <circle cx="10" cy="10" r="1.6" />
                <circle cx="10" cy="15.5" r="1.6" />
              </svg>
            </button>
            {menuOpen && (
              <div ref={menuRef} id={`${uid}-menu`} role="menu" className={styles.menu} aria-label={`Acciones de ${product.name}`} onKeyDown={onMenuKey}>
                <button type="button" role="menuitem" className={styles.menuItem} onClick={run(onDuplicate)}>
                  Duplicar
                </button>
                <button type="button" role="menuitem" className={styles.menuItem} onClick={run(onToggleStatus)}>
                  {paused ? "Activar" : "Pausar"}
                </button>
                <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={run(onDelete)}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>

        <dl className={styles.facts}>
          <div>
            <dt>Precio</dt>
            <dd>{formatPrice(product.price)}</dd>
          </div>
          <div>
            <dt>Stock</dt>
            <dd className={product.stock === 0 ? styles.factAlert : undefined}>{product.stock}</dd>
          </div>
        </dl>

        {product.description && <p className={styles.description}>{product.description}</p>}

        <div className={styles.footer}>
          <div className={styles.featuredToggle}>
            <button
              type="button"
              role="switch"
              aria-checked={product.featured}
              aria-labelledby={`${uid}-featured`}
              className={styles.miniSwitch}
              onClick={onToggleFeatured}
              disabled={busy}
            >
              <span className={styles.miniThumb} aria-hidden="true" />
            </button>
            <span id={`${uid}-featured`}>Destacado</span>
          </div>
          <button type="button" className={styles.editButton} onClick={onEdit} disabled={busy}>
            Editar
          </button>
        </div>
      </div>
    </article>
  );
}
