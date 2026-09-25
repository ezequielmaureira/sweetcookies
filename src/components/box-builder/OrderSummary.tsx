"use client";

import type { CartLine } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
import { formatCookieCount } from "@/lib/cart";
import { formatCents, toCents } from "@/lib/catalog";
import styles from "./OrderSummary.module.css";

type OrderSummaryProps = {
  lines: CartLine[];
  totalCount: number;
  /** Total estimado en centavos (el definitivo lo calcula el servidor al confirmar). */
  totalCents: number;
  onRemove?: (id: string) => void;
  /** Sin acciones: solo el listado (usado en la confirmación). */
  onKeepChoosing?: () => void;
  onContinue?: () => void;
  compact?: boolean;
};

/** Resumen del pedido con importes del catálogo real. */
export function OrderSummary({ lines, totalCount, totalCents, onRemove, onKeepChoosing, onContinue, compact }: OrderSummaryProps) {
  return (
    <div className={[styles.summary, compact ? styles.compact : ""].join(" ")}>
      <p className="kicker">Tu pedido</p>

      {lines.length === 0 ? (
        <p className={styles.empty}>Todavía no agregaste cookies.</p>
      ) : (
        <ul className={styles.lines}>
          {lines.map(({ product, quantity }) => (
            <li key={product.id} className={styles.line}>
              <span className={styles.qty}>{quantity} ×</span>
              <span className={styles.name}>{product.name}</span>
              <span className={styles.amount}>{formatCents(toCents(product.price) * quantity)}</span>
              {onRemove && (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onRemove(product.id)}
                  aria-label={`Eliminar ${product.name} del pedido`}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={styles.total}>
        <span>
          Total <span className={styles.count}>· {formatCookieCount(totalCount)}</span>
        </span>
        <span className={styles.totalValue}>{formatCents(totalCents)}</span>
      </p>

      {(onKeepChoosing || onContinue) && (
        <div className={styles.actions}>
          {onKeepChoosing && (
            <Button variant="secondary" onClick={onKeepChoosing}>
              Seguir eligiendo
            </Button>
          )}
          {onContinue && (
            <Button onClick={onContinue} disabled={totalCount === 0} arrow>
              Continuar pedido
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
