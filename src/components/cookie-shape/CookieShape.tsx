"use client";

import Image from "next/image";
import { useState } from "react";
import { boxImageStyle, type BoxViewSource } from "@/lib/box-view";
import { isRemoteImage, resolveImageSrc } from "@/lib/catalog";
import styles from "./CookieShape.module.css";

/**
 * Silueta de cookie casera: redonda en esencia, con el borde levemente
 * irregular (suma de ondas suaves). Determinista: la misma forma en servidor,
 * cliente y en cada cookie; varía con `variant` para que la caja no se vea
 * "clonada".
 */
function cookiePath(variant: number): string {
  const points: string[] = [];
  const phase = variant * 1.7;
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const r =
      46.2 +
      1.5 * Math.sin(3 * t + 0.4 + phase) +
      1.0 * Math.sin(5 * t + 1.3 + phase * 0.6) +
      0.6 * Math.sin(9 * t + 2.1 + phase * 1.3) +
      0.35 * Math.sin(14 * t + phase * 0.4);
    points.push(`${(50 + Math.cos(t) * r).toFixed(2)} ${(50 + Math.sin(t) * r).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

const MASKS = [0, 1, 2, 3].map((variant) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${cookiePath(variant)}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
});

type CookieShapeProps = {
  /** Imagen y encuadre (ver boxViewSource). */
  view: Pick<BoxViewSource, "src" | "scale" | "x" | "y" | "rotation">;
  /** Nombre para el texto alternativo (vacío = decorativa). */
  label?: string;
  /** Variante de silueta (0–3), para que las cookies de una caja no sean idénticas. */
  variant?: number;
  sizes?: string;
  className?: string;
};

/** Una cookie dentro de su silueta: la foto encuadrada, nunca un rectángulo. */
export function CookieShape({ view, label = "", variant = 0, sizes = "120px", className }: CookieShapeProps) {
  const src = resolveImageSrc(view.src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const mask = MASKS[Math.abs(variant) % MASKS.length];
  const showImage = src && failedSrc !== src;

  return (
    <span className={[styles.shape, className].filter(Boolean).join(" ")} role={label ? "img" : undefined} aria-label={label || undefined}>
      <span className={styles.mask} style={{ maskImage: mask, WebkitMaskImage: mask }}>
        {showImage ? (
          <Image
            src={src}
            alt=""
            fill
            sizes={sizes}
            draggable={false}
            unoptimized={isRemoteImage(src)}
            className={styles.photo}
            style={boxImageStyle(view)}
            onError={() => setFailedSrc(src)}
          />
        ) : (
          <span className={styles.empty} aria-hidden="true" />
        )}
        <span className={styles.shade} aria-hidden="true" />
      </span>
    </span>
  );
}
