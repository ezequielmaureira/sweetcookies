"use client";

import { useCart } from "@/components/cart/CartProvider";
import { FlavorsList } from "./FlavorsList";
import styles from "./FlavorsSection.module.css";

/**
 * "Sumá algo más": productos que no son cookies (budines, tortas, brownies…).
 * Se agregan al mismo pedido pero nunca ocupan lugar en el box.
 * Si no hay ninguno cargado, la sección no aparece.
 */
export function ExtrasSection() {
  const { products } = useCart();
  if (!products.some((p) => p.kind === "OTHER")) return null;

  return (
    <section id="sumar-algo-mas" className={styles.section} aria-labelledby="extras-title">
      <div className="container">
        <header className={styles.header} data-reveal>
          <h2 id="extras-title" className={styles.title}>
            Sumá algo más
          </h2>
          <p className={styles.subtitle}>Budines, tortas y más para sumar a tu pedido. Se compran aparte: no ocupan lugar en tu box.</p>
        </header>
      </div>

      <FlavorsList kind="OTHER" />
    </section>
  );
}
