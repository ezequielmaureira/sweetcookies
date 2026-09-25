/**
 * Vista de una cookie en la caja (lógica pura, compartida por la caja del
 * comprador y el preview del admin).
 *
 * Prioridad:
 *   1) boxImageUrl (imagen específica para caja, opcional)
 *   2) imageUrl (foto principal) encuadrada
 * El encuadre (zoom, punto central y rotación) se aplica a la imagen elegida.
 */
import type { BoxView } from "./catalog.ts";

export type BoxViewSource = {
  /** Ruta guardada de la imagen a usar (sin resolver), o null si no hay ninguna. */
  src: string | null;
  /** true si es la imagen específica para caja. */
  specific: boolean;
  scale: number;
  x: number;
  y: number;
  rotation: number;
};

export function boxViewSource(product: BoxView & { imageUrl: string | null }): BoxViewSource {
  const specific = Boolean(product.boxImageUrl);
  return {
    src: product.boxImageUrl || product.imageUrl || null,
    specific,
    scale: product.boxImageScale,
    x: product.boxImageX,
    y: product.boxImageY,
    rotation: product.boxImageRotation,
  };
}

/**
 * Estilo de la foto dentro de la silueta: cubre la cookie, el punto (x, y)
 * queda en el centro y el zoom / rotación giran alrededor de ese punto.
 */
export function boxImageStyle({ scale, x, y, rotation }: Pick<BoxViewSource, "scale" | "x" | "y" | "rotation">) {
  return {
    objectPosition: `${x}% ${y}%`,
    transformOrigin: `${x}% ${y}%`,
    transform: `scale(${scale})${rotation ? ` rotate(${rotation}deg)` : ""}`,
  } as const;
}

/* ---------- Formato de la caja ---------- */

export type BoxFormat = { capacity: number; columns: number; rows: number };

/**
 * Cajas con lugares fijos: 6 (3 × 2), 8 (4 × 2), 12 (4 × 3). Se elige la más
 * chica donde entra el pedido; más de 12 cookies suma filas de 4.
 * Cada cookie ocupa un lugar propio: nunca se superponen.
 */
export const BOX_FORMATS: readonly BoxFormat[] = [
  { capacity: 6, columns: 3, rows: 2 },
  { capacity: 8, columns: 4, rows: 2 },
  { capacity: 12, columns: 4, rows: 3 },
];

export function boxFormat(count: number): BoxFormat {
  const fit = BOX_FORMATS.find((f) => count <= f.capacity);
  if (fit) return fit;
  const rows = Math.ceil(count / 4);
  return { capacity: rows * 4, columns: 4, rows };
}
