"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { CookieImage } from "@/components/ui/CookieImage";
import { availabilityLabel, formatPrice, productAlt, type Product } from "@/lib/catalog";
import styles from "./CookieCard.module.css";

type CookieCardProps = {
  product: Product;
  /** Llamado al agregar; usado para anunciar el cambio a lectores de pantalla. */
  onAdded?: (product: Product) => void;
};

export function CookieCard({ product, onAdded }: CookieCardProps) {
  const { addItem, items } = useCart();
  const inCart = items[product.id] ?? 0;
  const soldOut = inCart >= product.stock;
  const availability = availabilityLabel(product.stock);
  const [added, setAdded] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleAdd = () => {
    if (soldOut) return;
    addItem(product.id);
    onAdded?.(product);
    setAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <CookieImage
          src={product.imageUrl}
          alt={productAlt(product)}
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 74vw"
          placeholderLabel={product.name}
          className={styles.image}
        />
        {product.featured && <span className={styles.featured}>Destacada</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.text}>
          <h3 className={styles.name}>{product.name}</h3>
          {product.description && <p className={styles.description}>{product.description}</p>}
          <p className={styles.price}>
            {formatPrice(product.price)}
            {availability && <span className={styles.availability}>{availability}</span>}
          </p>
        </div>

        <button
          type="button"
          className={[styles.add, added ? styles.added : ""].join(" ")}
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={soldOut ? `${product.name}: ya tenés todo el stock disponible` : `Agregar ${product.name}`}
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
