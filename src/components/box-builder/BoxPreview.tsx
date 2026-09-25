"use client";

import Image from "next/image";
import { useState } from "react";
import type { CartLine } from "@/components/cart/CartProvider";
import type { Flavor } from "@/data/cookies";
import { buildBoxLayout } from "@/lib/box";
import { formatCookieCount } from "@/lib/cart";
import type { FlavorImages } from "./types";
import styles from "./BoxPreview.module.css";

const COLUMNS = 4;
const MAX_VISIBLE = 16;

type BoxPreviewProps = {
  lines: CartLine[];
  totalCount: number;
  images: FlavorImages;
  /** Tamaño oficial de caja (a futuro). null = la caja muestra el pedido tal cual. */
  capacity?: number | null;
};

/** Paso 2: caja Sweet Cookies con una cookie dibujada por unidad del pedido. */
export function BoxPreview({ lines, totalCount, images, capacity = null }: BoxPreviewProps) {
  const layout = buildBoxLayout(
    lines.map(({ flavor, quantity }) => ({ id: flavor.id, quantity })),
    { columns: COLUMNS, maxVisible: MAX_VISIBLE, capacity },
  );
  const byId = Object.fromEntries(lines.map(({ flavor }) => [flavor.id, flavor]));

  const description =
    totalCount === 0
      ? "Tu caja está vacía."
      : `Tu caja con ${formatCookieCount(totalCount)}: ${lines.map((l) => `${l.quantity} ${l.flavor.name}`).join(", ")}.`;

  return (
    <div className={styles.box} role="img" aria-label={description}>
      <div className={styles.lid} aria-hidden="true">
        <span className={styles.brand}>
          Sweet <em>Cookies</em>
        </span>
        <span className={styles.count}>{formatCookieCount(totalCount)}</span>
      </div>

      <div className={styles.tray} aria-hidden="true">
        <ul className={styles.grid} style={{ "--cols": COLUMNS } as React.CSSProperties}>
          {layout.units.map((unit) => (
            <li key={unit.key} className={styles.slot}>
              <BoxCookie flavor={byId[unit.flavorId]} src={images[unit.flavorId] ?? null} />
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

function BoxCookie({ flavor, src }: { flavor: Flavor; src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.cookie} style={{ "--tint": flavor.tint } as React.CSSProperties} title={flavor.name}>
      {src && !failed ? (
        <Image src={src} alt="" fill sizes="96px" className={styles.photo} onError={() => setFailed(true)} />
      ) : (
        <span className={styles.monogram}>{monogram(flavor.name)}</span>
      )}
    </span>
  );
}
