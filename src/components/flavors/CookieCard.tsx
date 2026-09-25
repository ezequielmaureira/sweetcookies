"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { CookieImage } from "@/components/ui/CookieImage";
import type { Flavor } from "@/data/cookies";
import styles from "./CookieCard.module.css";

type CookieCardProps = {
  flavor: Flavor;
  imageSrc: string | null;
  /** Llamado al agregar; usado para anunciar el cambio a lectores de pantalla. */
  onAdded?: (flavor: Flavor) => void;
};

export function CookieCard({ flavor, imageSrc, onAdded }: CookieCardProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleAdd = () => {
    addItem(flavor.id);
    onAdded?.(flavor);
    setAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <CookieImage
          src={imageSrc}
          alt={flavor.alt}
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 74vw"
          placeholderLabel={flavor.name}
          className={styles.image}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.text}>
          <h3 className={styles.name}>{flavor.name}</h3>
          {flavor.description && <p className={styles.description}>{flavor.description}</p>}
        </div>

        <button
          type="button"
          className={[styles.add, added ? styles.added : ""].join(" ")}
          onClick={handleAdd}
          disabled={!flavor.available}
          aria-label={`Agregar ${flavor.name}`}
        >
          <span className={styles.addLabel} aria-hidden="true">
            <span className={styles.addDefault}>
              Agregar <span className={styles.plus}>+</span>
            </span>
            <span className={styles.addDone}>
              Agregada
              <svg viewBox="0 0 16 16" className={styles.check}>
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </button>
      </div>
    </article>
  );
}
