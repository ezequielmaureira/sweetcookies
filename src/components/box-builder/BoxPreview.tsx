"use client";

import type { CartLine } from "@/components/cart/CartProvider";
import { CookieShape } from "@/components/cookie-shape/CookieShape";
import { buildBoxLayout } from "@/lib/box";
import { boxFormat, boxViewSource } from "@/lib/box-view";
import { formatCookieCount } from "@/lib/cart";
import styles from "./BoxPreview.module.css";

/** Más de 16 cookies se resumen como "+N" (la caja sigue siendo legible). */
const MAX_VISIBLE = 16;

type BoxPreviewProps = {
  lines: CartLine[];
  totalCount: number;
};

/**
 * Paso 2: caja vista desde arriba con lugares fijos (6, 8 o 12). Cada cookie
 * ocupa un lugar propio de la grilla, así nunca se superponen; los lugares
 * libres se ven vacíos. Cada cookie usa su vista en caja: imagen específica si
 * existe, si no la foto principal encuadrada.
 */
export function BoxPreview({ lines, totalCount }: BoxPreviewProps) {
  const format = boxFormat(totalCount);
  const layout = buildBoxLayout(
    lines.map(({ product, quantity }) => ({ id: product.id, quantity })),
    { columns: format.columns, maxVisible: MAX_VISIBLE, capacity: format.capacity },
  );
  const byId = Object.fromEntries(lines.map(({ product }) => [product.id, product]));

  const description =
    totalCount === 0
      ? "Tu caja está vacía."
      : `Tu caja con ${formatCookieCount(totalCount)}: ${lines.map((l) => `${l.quantity} ${l.product.name}`).join(", ")}.`;

  return (
    <div className={styles.box} role="img" aria-label={description}>
      <div className={styles.lid} aria-hidden="true">
        <span className={styles.brand}>Tu caja</span>
        <span className={styles.count}>{formatCookieCount(totalCount)}</span>
      </div>

      <div className={styles.tray} aria-hidden="true">
        <ul className={styles.grid} style={{ "--cols": format.columns } as React.CSSProperties}>
          {layout.units.map((unit, index) => {
            const product = byId[unit.flavorId];
            return (
              <li key={unit.key} className={styles.slot} title={product.name}>
                <span className={styles.cookie}>
                  <CookieShape view={boxViewSource(product)} variant={index} sizes="120px" />
                </span>
              </li>
            );
          })}
          {layout.hiddenCount > 0 && (
            <li className={styles.slot}>
              <span className={styles.more}>+{layout.hiddenCount}</span>
            </li>
          )}
          {Array.from({ length: layout.emptySlots }, (_, i) => (
            <li key={`empty-${i}`} className={styles.slot}>
              <span className={styles.empty} />
            </li>
          ))}
        </ul>
        {totalCount === 0 && <p className={styles.emptyText}>Tu caja está vacía. Agregá tus sabores.</p>}
      </div>
    </div>
  );
}
