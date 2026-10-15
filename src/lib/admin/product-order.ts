import type { AdminApiError } from "@/lib/admin/admin-api";

/**
 * Orden de la web (lógica pura): mueve `id` a la posición `toIndex` (0 = primero).
 * Devuelve el nuevo orden de ids, o null si el movimiento no cambia nada o es inválido.
 */
export function moveId(ids: readonly string[], id: string, toIndex: number): string[] | null {
  const from = ids.indexOf(id);
  if (from < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= ids.length || from === toIndex) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(toIndex, 0, id);
  return next;
}

/** AdminApiError por forma (sin importar el módulo: así se puede testear con node --test). */
const isApiError = (error: unknown): error is Pick<AdminApiError, "status" | "fields"> =>
  typeof error === "object" && error !== null && typeof (error as { status?: unknown }).status === "number";

/** Mensaje real cuando no se pudo guardar el orden (nunca se finge que se guardó). */
export function reorderErrorMessage(error: unknown): string {
  if (!isApiError(error)) return "No pudimos guardar el orden. Volvimos al orden anterior.";
  if (error.status === 404) return "No se guardó: el servidor todavía no tiene la función de ordenar (falta actualizar la API). Volvimos al orden anterior.";
  if (error.status === 401 || error.status === 403) return "No se guardó: tu sesión no tiene permisos. Volvé a ingresar.";
  if (error.status === 422) return `No se guardó: ${Object.values(error.fields)[0] ?? "la lista de productos no es válida"}. Recargá la página y probá de nuevo.`;
  if (error.status === 0) return "No se guardó: no hay conexión con el servidor. Volvimos al orden anterior.";
  return `No se guardó el orden (error ${error.status} del servidor). Volvimos al orden anterior.`;
}
