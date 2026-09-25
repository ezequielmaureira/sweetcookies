"use client";

import { useEffect, useRef } from "react";
import { MAX_QUANTITY_PER_FLAVOR } from "@/lib/cart";
import styles from "./QuantityStepper.module.css";

type QuantityStepperProps = {
  name: string;
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
};

/**
 * [ + Agregar ] cuando la cantidad es 0; [-] n [+] cuando hay cookies.
 * Mantiene el foco en un control equivalente cuando cambia entre ambos estados.
 */
export function QuantityStepper({ name, quantity, onIncrement, onDecrement, disabled }: QuantityStepperProps) {
  const addRef = useRef<HTMLButtonElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"add" | "plus" | null>(null);

  useEffect(() => {
    if (pendingFocus.current === "plus") plusRef.current?.focus();
    if (pendingFocus.current === "add") addRef.current?.focus();
    pendingFocus.current = null;
  }, [quantity]);

  if (quantity === 0) {
    return (
      <button
        ref={addRef}
        type="button"
        className={styles.add}
        onClick={() => {
          pendingFocus.current = "plus";
          onIncrement();
        }}
        disabled={disabled}
        aria-label={`Agregar ${name}`}
      >
        <span aria-hidden="true">+</span> Agregar
      </button>
    );
  }

  return (
    <div className={styles.stepper} role="group" aria-label={`Cantidad de ${name}`}>
      <button
        type="button"
        className={styles.control}
        onClick={() => {
          if (quantity === 1) pendingFocus.current = "add";
          onDecrement();
        }}
        aria-label={`Quitar ${name}`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {/* La key reinicia la animación del número en cada cambio. */}
      <span key={quantity} className={styles.value} aria-hidden="true">
        {quantity}
      </span>
      <button
        ref={plusRef}
        type="button"
        className={styles.control}
        onClick={onIncrement}
        disabled={disabled || quantity >= MAX_QUANTITY_PER_FLAVOR}
        aria-label={`Agregar ${name}`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9M8 3.5v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
