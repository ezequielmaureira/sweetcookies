"use client";

import Image from "next/image";
import { useState } from "react";
import type { CartLine } from "@/components/cart/CartProvider";
import { buildBoxLayout } from "@/lib/box";
import { formatCookieCount } from "@/lib/cart";
import { isRemoteImage, type Product } from "@/lib/catalog";
import styles from "./BoxPreview.module.css";

const COLUMNS = 4;
const MAX_VISIBLE = 16;

type BoxPreviewProps = {
  lines: CartLine[];
  totalCount: number;
  /** Tamaño oficial de caja (a futuro). null = la caja muestra el pedido tal cual. */
  capacity?: number | null;
};

/** Paso 2: caja Sweet Cookies con una cookie dibujada por unidad del pedido. */
export function BoxPreview({ lines, totalCount, capacity = null }: BoxPreviewProps) {
  const layout = buildBoxLayout(
    lines.map(({ product, quantity }) => ({ id: product.id, quantity })),
    { columns: COLUMNS, maxVisible: MAX_VISIBLE, capacity },
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
        <ul className={styles.grid} style={{ "--cols": COLUMNS } as React.CSSProperties}>
          {layout.units.map((unit) => (
            <li key={unit.key} className={styles.slot}>
              <BoxCookie product={byId[unit.flavorId]} />
            </li>
          ))}
          {layout.hiddenCount > 0 && (
            <li className={styles.slot}>
              <span className={`${styles.cookie} ${styles.more}`}>+{layout.hiddenCount}</span>
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

/** Iniciales para distinguir sabores cuando falta la foto (ej. "Red Velvet" → "RV"). */
function monogram(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(word) && word.toLowerCase() !== "estilo")
    .map((word) => word[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

function BoxCookie({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const src = product.imageUrl;
  return (
    <span className={styles.cookie} title={product.name}>
      {src && !failed ? (
        <Image src={src} alt="" fill sizes="96px" unoptimized={isRemoteImage(src)} className={styles.photo} onError={() => setFailed(true)} />
      ) : (
        <span className={styles.monogram}>{monogram(product.name)}</span>
      )}
    </span>
  );
}
