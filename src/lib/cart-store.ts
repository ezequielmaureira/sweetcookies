import { EMPTY_CART, sanitizeCartItems, type CartItems } from "./cart";

/**
 * Store externo del carrito persistido en localStorage, pensado para
 * useSyncExternalStore:
 * - En el servidor (y durante la hidratación) el snapshot es el carrito vacío,
 *   así el HTML del servidor y el primer render del cliente coinciden.
 * - En el cliente se lee localStorage recién cuando React pide el snapshot.
 * - Se sincroniza entre pestañas con el evento "storage".
 */
const STORAGE_KEY = "sweetcookies:cart";
const STORAGE_VERSION = 1;

const listeners = new Set<() => void>();

let state: CartItems = EMPTY_CART;
let loaded = false;

function readStorage(): CartItems {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || (parsed as { v?: unknown }).v !== STORAGE_VERSION) {
      return EMPTY_CART;
    }
    return sanitizeCartItems((parsed as { items?: unknown }).items);
  } catch {
    // JSON corrupto o storage bloqueado (modo privado, permisos): carrito vacío.
    return EMPTY_CART;
  }
}

function writeStorage(items: CartItems) {
  try {
    if (Object.keys(items).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, items }));
  } catch {
    // Sin persistencia disponible: el carrito sigue funcionando en memoria.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  state = readStorage();
  emit();
}

export const cartStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  },

  getSnapshot(): CartItems {
    if (!loaded) {
      loaded = true;
      state = readStorage();
    }
    return state;
  },

  getServerSnapshot(): CartItems {
    return EMPTY_CART;
  },

  update(updater: (items: CartItems) => CartItems) {
    const next = updater(cartStore.getSnapshot());
    if (next === state) return;
    state = next;
    writeStorage(next);
    emit();
  },
};
