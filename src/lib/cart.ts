/**
 * Lógica pura del carrito (sin React ni navegador) para poder testearla.
 */

/** Cantidades por id de sabor. El orden de las claves es el orden de agregado. */
export type CartItems = Readonly<Record<string, number>>;

/** Tope técnico por sabor para evitar valores absurdos (no es una regla comercial). */
export const MAX_QUANTITY_PER_FLAVOR = 99;

export const EMPTY_CART: CartItems = Object.freeze({});

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_QUANTITY_PER_FLAVOR, Math.max(0, Math.floor(value)));
}

const ID = /^[\w-]{1,40}$/;

/**
 * Normaliza datos desconocidos (por ejemplo, leídos de localStorage):
 * descarta cantidades inválidas y, si se pasa el catálogo, ids que ya no existen.
 * Sin catálogo (al leer localStorage) solo se valida el formato del id: el
 * catálogo real llega de la base y el carrito lo cruza al mostrar las líneas.
 */
export function sanitizeCartItems(raw: unknown, validIds?: ReadonlySet<string>): CartItems {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_CART;
  const result: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID.test(id) || (validIds && !validIds.has(id)) || typeof value !== "number") continue;
    const quantity = clampQuantity(value);
    if (quantity > 0) result[id] = quantity;
  }
  return Object.keys(result).length ? result : EMPTY_CART;
}

/** Devuelve un carrito nuevo con la cantidad indicada (0 elimina el sabor). */
export function withQuantity(items: CartItems, id: string, quantity: number): CartItems {
  const next = clampQuantity(quantity);
  if ((items[id] ?? 0) === next) return items;
  if (next === 0) {
    if (!(id in items)) return items;
    const rest = { ...items };
    delete rest[id];
    return Object.keys(rest).length ? rest : EMPTY_CART;
  }
  return { ...items, [id]: next };
}

export function countItems(items: CartItems): number {
  return Object.values(items).reduce((sum, quantity) => sum + quantity, 0);
}

export function formatCookieCount(count: number): string {
  return `${count} ${count === 1 ? "cookie" : "cookies"}`;
}
