"use client";

import type { CartLine } from "@/components/cart/CartProvider";
import { CookieImage } from "@/components/ui/CookieImage";
import { formatCartCount } from "@/lib/cart";
import { formatCents } from "@/lib/catalog";
import { BoxPreview } from "./BoxPreview";
import styles from "./OrderPreview.module.css";

type OrderPreviewProps = {
  /** Cookies: van dentro de la caja. */
  boxLines: CartLine[];
  /** Otros productos (budín, torta…): al lado de la caja, nunca adentro. */
  extraLines: CartLine[];
  cookieCount: number;
  extraCount: number;
  totalCents: number;
  /** Versión chica (celular): no tapa los productos. */
  compact?: boolean;
};

/**
 * Lo que está comprando el cliente, dibujado:
 * - La caja SOLO aparece si hay al menos una cookie (con sus lugares de siempre).
 * - Los otros productos se muestran con su foto real, al lado de la caja.
 * - Sin nada elegido: un estado vacío amable, sin caja.
 */
export function OrderPreview({ boxLines, extraLines, cookieCount, extraCount, totalCents, compact = false }: OrderPreviewProps) {
  const hasBox = boxLines.length > 0;
  const hasExtras = extraLines.length > 0;
  const empty = !hasBox && !hasExtras;

  return (
    <div className={[styles.preview, compact ? styles.compact : ""].join(" ")}>
      <div className={styles.header}>
        <span className={styles.title}>Tu pedido</span>
        {!empty && (
          <span className={styles.meta}>
            {formatCartCount(cookieCount, extraCount)} · {formatCents(totalCents)}
          </span>
        )}
      </div>

      {empty ? (
        <div className={styles.empty} role="status">
          <svg viewBox="0 0 48 48" aria-hidden="true" className={styles.emptyIcon}>
            <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="18" cy="19" r="2" fill="currentColor" />
            <circle cx="28" cy="16" r="1.5" fill="currentColor" />
            <circle cx="29" cy="28" r="2.2" fill="currentColor" />
            <circle cx="19" cy="30" r="1.4" fill="currentColor" />
          </svg>
          <p>
            <strong>Tu pedido está vacío.</strong> Agregá lo que quieras y lo vas a ver acá.
          </p>
        </div>
      ) : (
        <div className={[styles.scene, hasBox && hasExtras ? styles.mixed : "", !hasBox ? styles.extrasOnly : ""].join(" ")}>
          {hasBox && (
            <div className={styles.boxSlot}>
              <BoxPreview lines={boxLines} totalCount={cookieCount} bare />
            </div>
          )}
          {hasExtras && (
            <ul className={styles.extras} aria-label="Otros productos">
              {extraLines.map(({ product, quantity }) => (
                <li key={product.id} className={styles.extra}>
                  <div className={styles.extraPhoto}>
                    <CookieImage
                      src={product.imageUrl}
                      alt={`${product.name}: ${quantity}`}
                      sizes={compact ? "72px" : "160px"}
                      placeholderLabel={product.name}
                      framing={{ scale: product.imageScale, x: product.imageX, y: product.imageY }}
                    />
                    {quantity > 1 && (
                      <span key={quantity} className={styles.badge} aria-hidden="true">
                        ×{quantity}
                      </span>
                    )}
                  </div>
                  <span className={styles.extraName}>{product.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
