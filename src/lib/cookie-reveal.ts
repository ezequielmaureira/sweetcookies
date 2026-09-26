/**
 * Geometría pura de "Descubrí el relleno" (sin DOM): encuadre tipo object-fit,
 * interpolación del trazo y porcentaje revelado. Ver CookieReveal.
 */

export type Fit = "cover" | "contain";
export type FocalPoint = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

/**
 * Rectángulo donde dibujar una imagen para que quede igual que un <img> con
 * object-fit (cover/contain) y object-position en porcentaje (focal 0–1).
 * Así la tapa (canvas) y el relleno (<img>) quedan alineados.
 */
export function fitRect(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, fit: Fit, focal: FocalPoint): Rect {
  if (imageWidth <= 0 || imageHeight <= 0) return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  const scaleX = boxWidth / imageWidth;
  const scaleY = boxHeight / imageHeight;
  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  // Igual que object-position: X% alinea el punto X% de la imagen con el X% de la caja.
  return { x: (boxWidth - width) * focal.x, y: (boxHeight - height) * focal.y, width, height };
}

/**
 * Puntos intermedios entre dos posiciones del dedo, separados como máximo
 * `spacing`, para que un movimiento rápido deje un trazo continuo.
 * No incluye `from` (ya se pintó en el evento anterior); sí incluye `to`.
 */
export function strokePoints(from: Point, to: Point, spacing: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / Math.max(spacing, 0.5)));
  const points: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: from.x + dx * t, y: from.y + dy * t });
  }
  return points;
}

/** Tamaño del pincel en px CSS: proporcional al área, cómodo para el dedo. */
export function autoBrushSize(boxWidth: number, boxHeight: number): number {
  return Math.round(Math.min(72, Math.max(44, Math.min(boxWidth, boxHeight) * 0.18)));
}

/**
 * Fracción revelada (0–1) a partir de la máscara reducida.
 * `mask`: RGBA de la máscara (alfa alto = borrado).
 * `weights`: cuánto importa cada píxel (alfa de la tapa; null = todos igual).
 * Así una tapa recortada (PNG sin fondo) cuenta solo la cookie, no el aire.
 */
export function revealedFraction(mask: Uint8ClampedArray, weights: Float32Array | null): number {
  let total = 0;
  let erased = 0;
  for (let i = 0, p = 0; i < mask.length; i += 4, p++) {
    const weight = weights ? weights[p] : 1;
    if (weight <= 0) continue;
    total += weight;
    if (mask[i + 3] >= 128) erased += weight;
  }
  return total > 0 ? erased / total : 0;
}
