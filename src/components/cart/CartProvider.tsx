"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { flavorsById, type Flavor } from "@/data/cookies";
import { EMPTY_CART, countItems, withQuantity, type CartItems } from "@/lib/cart";
import { cartStore } from "@/lib/cart-store";

export type { CartItems } from "@/lib/cart";

export type CartLine = { flavor: Flavor; quantity: number };

type CartContextValue = {
  items: CartItems;
  /** Líneas válidas del carrito, en el orden en que se agregaron. */
  lines: CartLine[];
  totalCount: number;
  /** false durante SSR / hidratación: todavía no se leyó localStorage. */
  isHydrated: boolean;
  /** Se incrementa en cada agregado; útil para disparar feedback visual. */
  addSignal: number;
  addItem: (id: string, quantity?: number) => void;
  removeItem: (id: string) => void;
  incrementItem: (id: string) => void;
  decrementItem: (id: string) => void;
  setItemQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const subscribeNothing = () => () => {};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  const isHydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [addSignal, setAddSignal] = useState(0);

  const addItem = useCallback((id: string, quantity = 1) => {
    if (!flavorsById[id]) return;
    cartStore.update((prev) => withQuantity(prev, id, (prev[id] ?? 0) + quantity));
    setAddSignal((n) => n + 1);
  }, []);

  const incrementItem = useCallback((id: string) => addItem(id, 1), [addItem]);

  const decrementItem = useCallback((id: string) => {
    cartStore.update((prev) => withQuantity(prev, id, (prev[id] ?? 0) - 1));
  }, []);

  const removeItem = useCallback((id: string) => {
    cartStore.update((prev) => withQuantity(prev, id, 0));
  }, []);

  const setItemQuantity = useCallback((id: string, quantity: number) => {
    if (!flavorsById[id]) return;
    cartStore.update((prev) => withQuantity(prev, id, quantity));
  }, []);

  const clearCart = useCallback(() => {
    cartStore.update(() => EMPTY_CART);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const lines = Object.entries(items).flatMap(([id, quantity]) => {
      const flavor = flavorsById[id];
      return flavor ? [{ flavor, quantity }] : [];
    });
    return {
      items,
      lines,
      totalCount: countItems(items),
      isHydrated,
      addSignal,
      addItem,
      removeItem,
      incrementItem,
      decrementItem,
      setItemQuantity,
      clearCart,
    };
  }, [items, isHydrated, addSignal, addItem, removeItem, incrementItem, decrementItem, setItemQuantity, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de <CartProvider>");
  return ctx;
}
