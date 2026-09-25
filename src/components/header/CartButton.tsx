"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";
import { routes } from "@/data/site";
import styles from "./Header.module.css";

/** Acceso al carrito: lleva a "Armá tu caja", donde está el resumen del pedido. */
export function CartButton() {
  const { totalCount, addSignal } = useCart();

  const label =
    totalCount === 0 ? "Carrito vacío" : `Carrito: ${totalCount} ${totalCount === 1 ? "cookie" : "cookies"}`;

  return (
    <Link href={routes.buildBox} className={styles.cart} aria-label={label}>
      {/* La key cambia en cada agregado: el span se vuelve a montar y repite la animación. */}
      <span key={addSignal} className={[styles.cartIconWrap, addSignal > 0 ? styles.cartBump : ""].join(" ")}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.cartIcon}>
          <path
            d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9 10V7a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {totalCount > 0 && (
          <span className={styles.cartCount} aria-hidden="true">
            {totalCount}
          </span>
        )}
      </span>
    </Link>
  );
}
