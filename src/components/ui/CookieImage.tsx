"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./CookieImage.module.css";

type CookieImageProps = {
  /** Ruta pública resuelta en el servidor, o null si la foto todavía no existe. */
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  /** Texto discreto del placeholder cuando falta la foto. */
  placeholderLabel?: string;
  className?: string;
};

/**
 * Foto real de producto que llena su contenedor (object-fit: cover).
 * Si falta el archivo o falla la carga, muestra un placeholder neutro.
 * El contenedor padre define el tamaño / aspect-ratio.
 */
export function CookieImage({ src, alt, sizes, priority, placeholderLabel, className }: CookieImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={[styles.placeholder, className].filter(Boolean).join(" ")} role="img" aria-label={alt}>
        <svg className={styles.placeholderIcon} viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="18" cy="19" r="2" fill="currentColor" />
          <circle cx="28" cy="16" r="1.5" fill="currentColor" />
          <circle cx="29" cy="28" r="2.2" fill="currentColor" />
          <circle cx="19" cy="30" r="1.4" fill="currentColor" />
        </svg>
        {placeholderLabel && <span className={styles.placeholderLabel}>{placeholderLabel}</span>}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={[styles.image, className].filter(Boolean).join(" ")}
      onError={() => setFailed(true)}
    />
  );
}
