"use client";

import { useCart } from "@/components/cart/CartProvider";
import { CookieImage } from "@/components/ui/CookieImage";
import { availabilityLabel, formatPrice, productAlt } from "@/lib/catalog";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./FlavorSelector.module.css";

type FlavorSelectorProps = {
  quantities: Readonly<Record<string, number>>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
};

/** Paso 1: catálogo real (PostgreSQL) con selector de cantidad limitado al stock. */
export function FlavorSelector({ quantities, onIncrement, onDecrement }: FlavorSelectorProps) {
  const { products, catalogStatus, refreshCatalog } = useCart();

  if (products.length === 0) {
    // Distinguir "cargando" / "no se pudo cargar" de "no hay productos disponibles".
    if (catalogStatus === "loading") {
      return (
        <p className={styles.empty} role="status">
          Cargando sabores…
        </p>
      );
    }
    if (catalogStatus === "error") {
      return (
        <div className={styles.empty} role="alert">
          <p>No pudimos cargar los sabores. Revisá tu conexión.</p>
          <button type="button" className={styles.retry} onClick={() => void refreshCatalog()}>
            Reintentar
          </button>
        </div>
      );
    }
    return (
      <p className={styles.empty} role="status">
        No hay sabores disponibles en este momento. Volvé a intentar en un rato.
      </p>
    );
  }

  return (
    <ul className={styles.grid}>
      {products.map((product) => {
        const quantity = Math.min(quantities[product.id] ?? 0, product.stock);
        const availability = availabilityLabel(product.stock);
        return (
          <li key={product.id} className={[styles.option, quantity > 0 ? styles.selected : ""].join(" ")}>
            <div className={styles.media}>
              <CookieImage
                src={product.imageUrl}
                alt={productAlt(product)}
                sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 45vw"
                placeholderLabel={product.name}
              />
              {quantity > 0 && (
                <span key={quantity} className={styles.badge} aria-hidden="true">
                  ×{quantity}
                </span>
              )}
            </div>
            <div className={styles.text}>
              <h3 className={styles.name}>{product.name}</h3>
              {product.description && <p className={styles.description}>{product.description}</p>}
              <p className={styles.price}>
                {formatPrice(product.price)}
                {availability && <span className={styles.availability}>{availability}</span>}
              </p>
            </div>
            <div className={styles.action}>
              <QuantityStepper
                name={product.name}
                quantity={quantity}
                max={product.stock}
                onIncrement={() => onIncrement(product.id)}
                onDecrement={() => onDecrement(product.id)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
