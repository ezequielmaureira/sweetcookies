"use client";

import { useEffect, useState } from "react";
import type { CartLine } from "@/components/cart/CartProvider";
import { CookieShape } from "@/components/cookie-shape/CookieShape";
import { EMPTY_SLOTS, reconcileSlots, type SlotState, type SlotUnit } from "@/lib/box-slots";
import { boxFormat, boxViewSource } from "@/lib/box-view";
import { formatCookieCount } from "@/lib/cart";
import { formatCents } from "@/lib/catalog";
import styles from "./BoxPreview.module.css";

/** Más de 16 cookies se resumen como "+N" (la caja sigue siendo legible). */
const MAX_VISIBLE = 16;
/** Duración de la salida de una cookie quitada. */
const LEAVE_MS = 240;

type Ghost = SlotUnit & { index: number };

type BoxPreviewProps = {
  lines: CartLine[];
  totalCount: number;
  /** Versión compacta (caja en vivo mientras se eligen sabores, en mobile). */
  compact?: boolean;
  /** Total estimado, para la versión compacta. */
  totalCents?: number;
};

/**
 * Caja de cookies vista desde arriba: cartón con paredes internas, papel
 * ajedrezado rojo y blanco, y un lugar fijo por cookie (6, 8 o 12 lugares).
 * Al agregar, la cookie entra en el primer lugar libre; al quitar, se libera
 * su lugar sin mover a las demás. Nunca se superponen.
 */
export function BoxPreview({ lines, totalCount, compact = false, totalCents }: BoxPreviewProps) {
  const quantities = lines.map(({ product, quantity }) => ({ id: product.id, quantity }));

  // Lugares estables: se ajustan durante el render cuando cambian las cantidades
  // (patrón de React para derivar estado de props sin efectos).
  const [slotState, setSlotState] = useState<SlotState>(() => reconcileSlots(EMPTY_SLOTS, quantities));
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const next = reconcileSlots(slotState, quantities);
  if (next !== slotState) {
    const kept = new Set(next.slots.filter(Boolean).map((u) => u?.key));
    const removed = slotState.slots.flatMap((unit, index) => (unit && !kept.has(unit.key) ? [{ ...unit, index }] : []));
    setSlotState(next);
    if (removed.length) setGhosts((prev) => [...prev, ...removed]);
  }

  // Los "fantasmas" (cookies quitadas) se desvanecen y se van.
  useEffect(() => {
    if (ghosts.length === 0) return;
    const timer = window.setTimeout(() => setGhosts([]), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [ghosts]);

  const byId = Object.fromEntries(lines.map(({ product }) => [product.id, product]));
  const overflow = totalCount > MAX_VISIBLE;
  // Con muchas cookies se muestran compactadas + "+N".
  const slots = overflow ? next.slots.filter(Boolean).slice(0, MAX_VISIBLE - 1) : next.slots;
  const hiddenCount = overflow ? totalCount - slots.length : 0;
  const format = boxFormat(Math.max(totalCount, slots.length + (overflow ? 1 : 0)));
  const capacity = Math.max(format.capacity, Math.ceil((slots.length + (overflow ? 1 : 0)) / format.columns) * format.columns);
  const ghostAt = new Map(ghosts.filter((g) => g.index < capacity && !slots[g.index]).map((g) => [g.index, g]));

  const description =
    totalCount === 0
      ? "Tu caja está vacía."
      : `Tu caja con ${formatCookieCount(totalCount)}: ${lines.map((l) => `${l.quantity} ${l.product.name}`).join(", ")}.`;

  const cells = Array.from({ length: capacity }, (_, index) => {
    const unit = slots[index];
    if (overflow && index === slots.length) {
      return (
        <li key="more" className={styles.slot}>
          <span className={styles.more}>+{hiddenCount}</span>
        </li>
      );
    }
    const product = unit ? byId[unit.flavorId] : null;
    const ghost = ghostAt.get(index);
    const ghostProduct = ghost ? byId[ghost.flavorId] : null;
    return (
      <li key={`slot-${index}`} className={styles.slot} title={product?.name}>
        <span className={styles.empty} />
        {unit && product && (
          <span key={unit.key} className={styles.cookie}>
            <CookieShape view={boxViewSource(product)} variant={index} sizes={compact ? "64px" : "120px"} />
          </span>
        )}
        {!unit && ghost && ghostProduct && (
          <span key={ghost.key} className={`${styles.cookie} ${styles.leaving}`}>
            <CookieShape view={boxViewSource(ghostProduct)} variant={index} sizes={compact ? "64px" : "120px"} />
          </span>
        )}
      </li>
    );
  });

  const box = (
    <div className={styles.carton}>
      <div className={styles.walls}>
        <div className={styles.paper}>
          <ul className={styles.grid} style={{ "--cols": format.columns } as React.CSSProperties}>
            {cells}
          </ul>
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div
        className={`${styles.box} ${styles.compact}`}
        role="img"
        aria-label={description}
        style={{ "--slot": `${format.rows >= 3 ? 44 : 52}px` } as React.CSSProperties}
      >
        {box}
        <div className={styles.info} aria-hidden="true">
          <span className={styles.brand}>Tu caja</span>
          <span key={totalCount} className={styles.bigCount}>
            {totalCount}
          </span>
          <span className={styles.count}>{totalCount === 1 ? "cookie" : "cookies"}</span>
          {totalCount > 0 && totalCents !== undefined && <span className={styles.total}>{formatCents(totalCents)}</span>}
          {totalCount === 0 && <span className={styles.hint}>Tocá “Agregar” y mirá cómo se llena.</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.box} role="img" aria-label={description}>
      <div className={styles.lid} aria-hidden="true">
        <span className={styles.brand}>Tu caja</span>
        <span className={styles.count}>{formatCookieCount(totalCount)}</span>
      </div>
      <div className={styles.frame} aria-hidden="true">
        {box}
        {totalCount === 0 && <p className={styles.emptyText}>Tu caja está vacía. Agregá tus sabores.</p>}
      </div>
    </div>
  );
}
