/**
 * Lugares de la caja (lógica pura).
 *
 * Cada cookie tiene un lugar propio y estable, como en una caja real:
 * - al agregar, ocupa el primer lugar libre (o el siguiente al final);
 * - al quitar, se libera el lugar de la última cookie de ese sabor, sin mover
 *   a las demás;
 * - si el pedido entra en una caja más chica, se reacomoda (compacta).
 */
import { boxFormat } from "./box-view.ts";

export type SlotUnit = { key: string; flavorId: string };
export type Slots = readonly (SlotUnit | null)[];
export type SlotState = { slots: Slots; seq: number };

export const EMPTY_SLOTS: SlotState = { slots: [], seq: 0 };

function countBy(slots: Slots): Map<string, number> {
  const counts = new Map<string, number>();
  for (const unit of slots) if (unit) counts.set(unit.flavorId, (counts.get(unit.flavorId) ?? 0) + 1);
  return counts;
}

/**
 * Lleva los lugares actuales a las cantidades pedidas.
 * `order`: orden de los sabores en el carrito (para ubicar varias altas juntas).
 */
export function reconcileSlots(state: SlotState, lines: ReadonlyArray<{ id: string; quantity: number }>): SlotState {
  const target = new Map(lines.map((l) => [l.id, Math.max(0, l.quantity)]));
  const slots: (SlotUnit | null)[] = [...state.slots];
  let seq = state.seq;
  const current = countBy(slots);

  // Bajas: se libera el lugar de la última cookie de ese sabor (índice más alto).
  for (const [flavorId, have] of current) {
    let extra = have - (target.get(flavorId) ?? 0);
    for (let i = slots.length - 1; i >= 0 && extra > 0; i--) {
      if (slots[i]?.flavorId === flavorId) {
        slots[i] = null;
        extra--;
      }
    }
  }

  // Altas: primer lugar libre, o al final.
  for (const { id, quantity } of lines) {
    let missing = quantity - (countBy(slots).get(id) ?? 0);
    while (missing > 0) {
      const unit = { key: `${id}~${++seq}`, flavorId: id };
      const hole = slots.indexOf(null);
      if (hole >= 0) slots[hole] = unit;
      else slots.push(unit);
      missing--;
    }
  }

  while (slots.length > 0 && slots[slots.length - 1] === null) slots.pop();

  // Si el pedido entra en una caja más chica, se reacomoda sin huecos.
  const total = slots.filter(Boolean).length;
  const compacted = slots.length > boxFormat(total).capacity ? slots.filter(Boolean) : slots;

  const unchanged = compacted.length === state.slots.length && compacted.every((u, i) => u === state.slots[i]);
  return unchanged ? state : { slots: compacted, seq };
}
