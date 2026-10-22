"use client";

import { useEffect, useState } from "react";

/** Foto real de la cookie para el juego (la misma variante optimizada que muestra la portada). */
export type ChallengeCookie = {
  /** Ruta original en /public (para next/image). */
  path: string;
  /** URL optimizada por Next y su srcset: el navegador reutiliza la descarga de la portada. */
  src: string;
  srcSet?: string;
  sizes: string;
  isCutout: boolean;
  alt: string;
};

/**
 * Descarga y decodifica la foto UNA vez para todo el juego (todas las cookies y
 * todas las partidas dibujan desde esta misma imagen en memoria).
 */
export function useCookieImage(cookie: ChallengeCookie | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = cookie?.src;
  const srcSet = cookie?.srcSet;
  const sizes = cookie?.sizes;

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    // sizes y srcset antes que src: así elige la misma variante que la portada.
    if (srcSet && sizes) {
      img.sizes = sizes;
      img.srcset = srcSet;
    }
    img.src = src;
    img
      .decode()
      .then(() => {
        if (!cancelled) setImage(img);
      })
      .catch(() => {
        if (cancelled) return;
        // Algunos navegadores rechazan decode() aunque la imagen haya cargado bien.
        if (img.complete && img.naturalWidth > 0) setImage(img);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src, srcSet, sizes, attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  return { image, failed: failed || !src, retry };
}
