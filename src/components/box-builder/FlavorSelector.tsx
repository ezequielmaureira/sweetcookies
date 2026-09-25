"use client";

import { CookieImage } from "@/components/ui/CookieImage";
import { flavors } from "@/data/cookies";
import { QuantityStepper } from "./QuantityStepper";
import type { FlavorImages } from "./types";
import styles from "./FlavorSelector.module.css";

type FlavorSelectorProps = {
  images: FlavorImages;
  quantities: Readonly<Record<string, number>>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
};

/** Paso 1: catálogo completo (src/data/cookies.ts) con selector de cantidad. */
export function FlavorSelector({ images, quantities, onIncrement, onDecrement }: FlavorSelectorProps) {
  return (
    <ul className={styles.grid}>
      {flavors.map((flavor) => {
        const quantity = quantities[flavor.id] ?? 0;
        return (
          <li key={flavor.id} className={[styles.option, quantity > 0 ? styles.selected : ""].join(" ")}>
            <div className={styles.media}>
              <CookieImage
                src={images[flavor.id] ?? null}
                alt={flavor.alt}
                sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 45vw"
                placeholderLabel={flavor.name}
              />
              {quantity > 0 && (
                <span key={quantity} className={styles.badge} aria-hidden="true">
                  ×{quantity}
                </span>
              )}
            </div>
            <div className={styles.text}>
              <h3 className={styles.name}>{flavor.name}</h3>
              {flavor.description && <p className={styles.description}>{flavor.description}</p>}
            </div>
            <div className={styles.action}>
              <QuantityStepper
                name={flavor.name}
                quantity={quantity}
                disabled={!flavor.available}
                onIncrement={() => onIncrement(flavor.id)}
                onDecrement={() => onDecrement(flavor.id)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
