"use client";

import type { CartLine } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
import { formatCookieCount } from "@/lib/cart";
import styles from "./OrderSummary.module.css";

type OrderSummaryProps = {
  lines: CartLine[];
  totalCount: number;
  onRemove?: (id: string) => void;
  /** Sin acciones: solo el listado (usado en la confirmación). */
  onKeepChoosing?: () => void;
  onContinue?: () => void;
  compact?: boolean;
};

/** Resumen del pedido, sin montos (todavía no hay precios reales). */
export function OrderSummary({ lines, totalCount, onRemove, onKeepChoosing, onContinue, compact }: OrderSummaryProps) {
  return (
    <div className={[styles.summary, compact ? styles.compact : ""].join(" ")}>
      <p className="kicker">Tu pedido</p>

      {lines.length === 0 ? (
        <p className={styles.empty}>Todavía no agregaste cookies.</p>
      ) : (
        <ul className={styles.lines}>
          {lines.map(({ flavor, quantity }) => (
            <li key={flavor.id} className={styles.line}>
              <span className={styles.qty}>{quantity} ×</span>
              <span className={styles.name}>{flavor.name}</span>
              {onRemove && (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onRemove(flavor.id)}
                  aria-label={`Eliminar ${flavor.name} del pedido`}
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
        <span>Total</span>
        <span className={styles.totalValue}>{formatCookieCount(totalCount)}</span>
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
