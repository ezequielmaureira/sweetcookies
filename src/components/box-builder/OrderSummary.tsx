"use client";

import type { CartLine } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
import { formatCartCount, formatCookieCount } from "@/lib/cart";
import { formatCents, toCents } from "@/lib/catalog";
import styles from "./OrderSummary.module.css";

type OrderSummaryProps = {
  /** Cookies: el contenido del box. */
  boxLines: CartLine[];
  /** Productos adicionales (budín, torta…): fuera del box. */
  extraLines: CartLine[];
  /** Total estimado en centavos (el definitivo lo calcula el servidor al confirmar). */
  totalCents: number;
  onRemove?: (id: string) => void;
  /** Cambiar la cantidad de un producto adicional desde el resumen. */
  onIncrement?: (id: string) => void;
  onDecrement?: (id: string) => void;
  /** Sin acciones: solo el listado (usado en la confirmación). */
  onKeepChoosing?: () => void;
  onContinue?: () => void;
  compact?: boolean;
};

const units = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.quantity, 0);
const cents = (lines: CartLine[]) => lines.reduce((sum, l) => sum + toCents(l.product.price) * l.quantity, 0);

/** Resumen del pedido con importes del catálogo real: el box y, aparte, los productos adicionales. */
export function OrderSummary({ boxLines, extraLines, totalCents, onRemove, onIncrement, onDecrement, onKeepChoosing, onContinue, compact }: OrderSummaryProps) {
  const cookieCount = units(boxLines);
  const extraCount = units(extraLines);
  const empty = boxLines.length === 0 && extraLines.length === 0;

  const line = ({ product, quantity }: CartLine, editable: boolean) => (
    <li key={product.id} className={styles.line}>
      {editable && onIncrement && onDecrement ? (
        <span className={styles.stepper} role="group" aria-label={`Cantidad de ${product.name}`}>
          <button type="button" className={styles.step} onClick={() => onDecrement(product.id)} aria-label={`Quitar un ${product.name}`}>
            −
          </button>
          <span className={styles.stepValue}>{quantity}</span>
          <button
            type="button"
            className={styles.step}
            onClick={() => onIncrement(product.id)}
            disabled={quantity >= product.stock}
            aria-label={quantity >= product.stock ? `${product.name}: no hay más stock disponible` : `Sumar un ${product.name}`}
          >
            +
          </button>
        </span>
      ) : (
        <span className={styles.qty}>{quantity} ×</span>
      )}
      <span className={styles.name}>{product.name}</span>
      <span className={styles.amount}>{formatCents(toCents(product.price) * quantity)}</span>
      {onRemove && (
        <button type="button" className={styles.remove} onClick={() => onRemove(product.id)} aria-label={`Eliminar ${product.name} del pedido`}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </li>
  );

  return (
    <div className={[styles.summary, compact ? styles.compact : ""].join(" ")}>
      <p className="kicker">Tu pedido</p>

      {empty ? (
        <p className={styles.empty}>Todavía no agregaste cookies ni otros productos.</p>
      ) : (
        <>
          {boxLines.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupTitle}>
                <span>Tu box · {formatCookieCount(cookieCount)}</span>
                {extraLines.length > 0 && <span>{formatCents(cents(boxLines))}</span>}
              </p>
              <ul className={styles.lines}>{boxLines.map((l) => line(l, false))}</ul>
            </div>
          )}
          {extraLines.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupTitle}>
                <span>Productos adicionales</span>
                {boxLines.length > 0 && <span>{formatCents(cents(extraLines))}</span>}
              </p>
              <ul className={styles.lines}>{extraLines.map((l) => line(l, true))}</ul>
            </div>
          )}
        </>
      )}

      <p className={styles.total}>
        <span>
          Total <span className={styles.count}>· {formatCartCount(cookieCount, extraCount)}</span>
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
            <Button onClick={onContinue} disabled={empty} arrow>
              Continuar pedido
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
