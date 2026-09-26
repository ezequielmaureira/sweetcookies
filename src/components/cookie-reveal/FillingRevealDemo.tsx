"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CookieReveal, type CookieRevealProps } from "./CookieReveal";
import styles from "./FillingRevealDemo.module.css";

type FillingRevealDemoProps = Pick<
  CookieRevealProps,
  "coverImage" | "revealImage" | "revealAlt" | "coverAlt" | "coverBackdrop" | "aspectRatio" | "scratchArea"
> & { flavorName: string };

/**
 * Demo temporal de "Descubrí el relleno": un botón abre un modal con CookieReveal.
 * Todavía no está conectado a los productos reales.
 */
export function FillingRevealDemo({ flavorName, ...reveal }: FillingRevealDemoProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    // Mientras el modal está abierto, la página de atrás no scrollea.
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Descubrí el relleno</Button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="filling-reveal-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Tocar el fondo oscuro cierra.
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        {open && (
          <div className={styles.body}>
            <header className={styles.header}>
              <div>
                <p className="kicker">{flavorName}</p>
                <h2 id="filling-reveal-title" className={styles.title}>
                  Descubrí el relleno
                </h2>
              </div>
              <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Cerrar">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <CookieReveal {...reveal} />
          </div>
        )}
      </dialog>
    </>
  );
}
