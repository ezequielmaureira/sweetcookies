/** Textos por defecto de la pantalla de mantenimiento (se usan si el admin no escribió los suyos). */
export const DEFAULT_MAINTENANCE_TITLE = "Estamos horneando algo especial…";
export const DEFAULT_MAINTENANCE_SUBTITLE = "Nuestra cocina digital está tomando un pequeño descanso.";

export const MAINTENANCE_TITLE_MAX = 80;
export const MAINTENANCE_SUBTITLE_MAX = 160;

/** null/"" → texto por defecto. Un solo lugar para que el gate y la vista previa del admin nunca queden desincronizados. */
export function resolveMaintenanceCopy(input: { title?: string | null; subtitle?: string | null }): { title: string; subtitle: string } {
  return {
    title: input.title?.trim() || DEFAULT_MAINTENANCE_TITLE,
    subtitle: input.subtitle?.trim() || DEFAULT_MAINTENANCE_SUBTITLE,
  };
}
