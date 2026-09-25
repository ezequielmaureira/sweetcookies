"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Estado mínimo del carrito para la home: cantidades por id de sabor.
 * Pensado para extenderse luego (caja, pedido, WhatsApp, persistencia).
 */
export type CartItems = Record<string, number>;

type CartContextValue = {
  items: CartItems;
  totalCount: number;
  /** Se incrementa en cada agregado; útil para disparar feedback visual. */
  addSignal: number;
  addItem: (id: string, quantity?: number) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItems>({});
  const [addSignal, setAddSignal] = useState(0);

  const addItem = useCallback((id: string, quantity = 1) => {
    setItems((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + quantity }));
    setAddSignal((n) => n + 1);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const totalCount = Object.values(items).reduce((sum, qty) => sum + qty, 0);
    return { items, totalCount, addSignal, addItem };
  }, [items, addSignal, addItem]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de <CartProvider>");
  return ctx;
}
