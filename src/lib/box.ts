/**
 * Representación visual de la caja.
 *
 * Hoy la caja no tiene tamaño fijo: muestra exactamente lo que hay en el
 * pedido. Para introducir tamaños oficiales más adelante, pasar `capacity`
 * (ej. 6, 12): los lugares libres se muestran vacíos hasta completarla.
 */
export type BoxUnit = { key: string; flavorId: string };

export type BoxLayout = {
  /** Cookies dibujadas (puede haber menos que el total si superan maxVisible). */
  units: BoxUnit[];
  /** Cookies no dibujadas, resumidas como "+N". */
  hiddenCount: number;
  /** Lugares vacíos para completar la última fila (o la capacidad). */
  emptySlots: number;
};

export function buildBoxLayout(
  lines: ReadonlyArray<{ id: string; quantity: number }>,
  { columns, maxVisible, capacity = null }: { columns: number; maxVisible: number; capacity?: number | null },
): BoxLayout {
  // Una unidad por cookie. La key es estable por sabor + índice: al agregar
  // una cookie solo se monta la nueva (y solo esa se anima).
  const all: BoxUnit[] = lines.flatMap(({ id, quantity }) =>
    Array.from({ length: quantity }, (_, i) => ({ key: `${id}-${i}`, flavorId: id })),
  );

  const overflow = all.length > maxVisible;
  const units = overflow ? all.slice(0, maxVisible - 1) : all;
  const hiddenCount = overflow ? all.length - units.length : 0;
  const drawn = units.length + (overflow ? 1 : 0);

  const target = capacity && capacity > drawn ? capacity : Math.max(columns, Math.ceil(drawn / columns) * columns);
  return { units, hiddenCount, emptySlots: Math.max(0, target - drawn) };
}
