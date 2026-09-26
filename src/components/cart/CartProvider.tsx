"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { EMPTY_CART, countItems, withQuantity, type CartItems } from "@/lib/cart";
import { cartStore } from "@/lib/cart-store";
import { toCents, type Product } from "@/lib/catalog";
import { useLiveCatalog, type CatalogStatus } from "@/lib/use-live-catalog";

export type { CartItems } from "@/lib/cart";

export type CartLine = { product: Product; quantity: number };

type CartContextValue = {
  /** Catálogo real (base de datos): solo productos activos, con stock y precio. */
  products: Product[];
  /** "error" solo si nunca se pudo cargar el catálogo (ni en el servidor ni en el navegador). */
  catalogStatus: CatalogStatus;
  /** Vuelve a pedir el catálogo a la API (sin caché). */
  refreshCatalog: () => Promise<void>;
  productsById: Readonly<Record<string, Product>>;
  items: CartItems;
  /** Líneas válidas del carrito (en el orden en que se agregaron), limitadas al stock. */
  lines: CartLine[];
  totalCount: number;
  /** Total estimado en centavos (el definitivo lo calcula el servidor al confirmar). */
  totalCents: number;
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

type CartProviderProps = {
  /** Catálogo del render del servidor (puede venir de caché): se refresca en el navegador. */
  initialProducts: Product[];
  /** false si el servidor no pudo leer la API. */
  catalogOk: boolean;
  children: React.ReactNode;
};

export function CartProvider({ initialProducts, catalogOk, children }: CartProviderProps) {
  const { products, status: catalogStatus, refresh: refreshCatalog } = useLiveCatalog(initialProducts, catalogOk);
  const items = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  const isHydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [addSignal, setAddSignal] = useState(0);
  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const addItem = useCallback(
    (id: string, quantity = 1) => {
      const product = productsById[id];
      if (!product) return;
      let added = false;
      cartStore.update((prev) => {
        const next = Math.min(product.stock, (prev[id] ?? 0) + quantity);
        added = next > (prev[id] ?? 0);
        return withQuantity(prev, id, next);
      });
      if (added) setAddSignal((n) => n + 1);
    },
    [productsById],
  );

  const incrementItem = useCallback((id: string) => addItem(id, 1), [addItem]);

  const decrementItem = useCallback((id: string) => {
    cartStore.update((prev) => withQuantity(prev, id, (prev[id] ?? 0) - 1));
  }, []);

  const removeItem = useCallback((id: string) => {
    cartStore.update((prev) => withQuantity(prev, id, 0));
  }, []);

  const setItemQuantity = useCallback(
    (id: string, quantity: number) => {
      const product = productsById[id];
      if (!product) return;
      cartStore.update((prev) => withQuantity(prev, id, Math.min(product.stock, quantity)));
    },
    [productsById],
  );

  const clearCart = useCallback(() => {
    cartStore.update(() => EMPTY_CART);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    // Productos que ya no están disponibles no se muestran ni se envían; la cantidad se limita al stock.
    const lines = Object.entries(items).flatMap(([id, quantity]) => {
      const product = productsById[id];
      return product ? [{ product, quantity: Math.min(quantity, product.stock) }] : [];
    });
    const valid = Object.fromEntries(lines.map((l) => [l.product.id, l.quantity]));
    return {
      products,
      catalogStatus,
      refreshCatalog,
      productsById,
      items,
      lines,
      totalCount: countItems(valid),
      totalCents: lines.reduce((sum, l) => sum + toCents(l.product.price) * l.quantity, 0),
      isHydrated,
      addSignal,
      addItem,
      removeItem,
      incrementItem,
      decrementItem,
      setItemQuantity,
      clearCart,
    };
  }, [products, catalogStatus, refreshCatalog, productsById, items, isHydrated, addSignal, addItem, removeItem, incrementItem, decrementItem, setItemQuantity, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de <CartProvider>");
  return ctx;
}
