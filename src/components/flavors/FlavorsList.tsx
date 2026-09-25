"use client";

import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { CookieCard } from "./CookieCard";
import styles from "./FlavorsSection.module.css";

export function FlavorsList({ products }: { products: Product[] }) {
  const [announcement, setAnnouncement] = useState("");

  const handleAdded = (product: Product) => {
    // Un carácter invisible distinto fuerza a repetir el anuncio si se agrega el mismo sabor.
    setAnnouncement((prev) => `${product.name} agregada al carrito${prev.endsWith("​") ? "" : "​"}`);
  };

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
