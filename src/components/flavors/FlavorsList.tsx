"use client";

import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import type { Product } from "@/lib/catalog";
import { CookieCard } from "./CookieCard";
import styles from "./FlavorsSection.module.css";

/** Lista del catálogo real (CartProvider lo refresca contra la API). */
export function FlavorsList() {
  const { products, catalogStatus, refreshCatalog } = useCart();
  const [announcement, setAnnouncement] = useState("");

  const handleAdded = (product: Product) => {
    // Un carácter invisible distinto fuerza a repetir el anuncio si se agrega el mismo sabor.
    setAnnouncement((prev) => `${product.name} agregada al carrito${prev.endsWith("​") ? "" : "​"}`);
  };

  if (products.length === 0) {
    return (
      <div className="container">
        {catalogStatus === "error" ? (
          <div className={styles.empty} role="alert">
            <p>No pudimos cargar los sabores en este momento.</p>
            <button type="button" className={styles.retry} onClick={() => void refreshCatalog()}>
              Reintentar
            </button>
          </div>
        ) : (
          <p className={styles.empty} role="status">
            {catalogStatus === "loading" ? "Cargando sabores…" : "Estamos horneando: muy pronto vas a ver nuestros sabores acá."}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={styles.scroller}>
        <ul className={`container ${styles.list}`}>
          {products.map((product, i) => (
            <li
              key={product.id}
              className={styles.item}
              data-reveal
              style={{ "--reveal-delay": `${(i % 3) * 90}ms` } as React.CSSProperties}
            >
              <CookieCard product={product} onAdded={handleAdded} />
            </li>
          ))}
        </ul>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
