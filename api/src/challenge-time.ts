/**
 * Fechas y estado de los torneos del Sweet Click Challenge (lógica pura).
 *
 * La autoridad es la hora del SERVIDOR. Las fechas que carga el admin se
 * interpretan en America/Argentina/Cordoba (nunca la zona del navegador). Se
 * usa Intl para convertir, así no depende de que Argentina siga sin horario de
 * verano.
 *
 * No hay calendario fijo: cada torneo tiene su inicio y su fin. Se activa y
 * finaliza solo, porque el estado se calcula con la hora en cada pedido (sin
 * cron y sin que el admin tenga que entrar al panel).
 */
export const CHALLENGE_TIME_ZONE = "America/Argentina/Cordoba";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHALLENGE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** Fecha y hora de pared en Córdoba para un instante. */
function wall(date: Date): Wall {
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) if (part.type !== "literal") parts[part.type] = Number(part.value);
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, second: parts.second };
}

/** Diferencia (ms) entre la hora de pared de Córdoba y UTC en ese instante (−3 h hoy). */
function offsetAt(date: Date): number {
  const w = wall(date);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC de una hora de pared de Córdoba. */
export function cordobaToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  let result = guess - offsetAt(new Date(guess));
  // Segunda pasada por si el desplazamiento cambia entre la estimación y el resultado.
  const corrected = guess - offsetAt(new Date(result));
  if (corrected !== result) result = corrected;
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Día calendario en Córdoba (YYYY-MM-DD). */
export function cordobaDay(date: Date): string {
  const w = wall(date);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Fecha (YYYY-MM-DD) y hora (HH:MM) de pared en Córdoba: para volver a llenar el formulario del admin. */
export function cordobaDateTime(date: Date): { date: string; time: string } {
  const w = wall(date);
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` };
}

/**
 * "2026-10-30" + "18:00" en Córdoba → instante UTC. `endOfMinute` = hasta el
 * final de ese minuto (un cierre "23:59" dura hasta 23:59:59.999).
 * null si la fecha u hora no existen.
 */
export function parseCordobaDateTime(date: string, time: string, endOfMinute = false): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  // Rechaza fechas que no existen (ej. 31/02): el día tiene que sobrevivir la conversión.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return cordobaToUtc(year, month, day, hour, minute, endOfMinute ? 59 : 0, endOfMinute ? 999 : 0);
}

export type ChallengeStatus = "DRAFT" | "UNPUBLISHED" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "FINISHED" | "RESULTS_PUBLISHED" | "CANCELLED";

/**
 * Estados guardados que significan "publicado" = visible al público (ACTIVE =
 * torneos anteriores a este cambio; FINISHED = finalizado a mano por el admin).
 * Publicado NO es lo mismo que activo: activo es publicado + dentro de sus fechas.
 */
export const PUBLISHED_STATUSES = ["SCHEDULED", "ACTIVE", "PAUSED", "FINISHED", "RESULTS_PUBLISHED"] as const;

/**
 * Estado real de un torneo: el guardado + la hora del servidor.
 * - Borrador, despublicado, finalizado a mano, ganador publicado y cancelado
 *   los decide el admin.
 * - Publicado: antes del inicio = PROGRAMADO; entre inicio y fin = ACTIVO (o
 *   PAUSADO); después del fin = FINALIZADO, aunque nadie lo haya cerrado.
 */
export function effectiveStatus(edition: { status: ChallengeStatus; startsAt: Date; endsAt: Date }, now: Date): ChallengeStatus {
  if (["DRAFT", "UNPUBLISHED", "FINISHED", "CANCELLED", "RESULTS_PUBLISHED"].includes(edition.status)) return edition.status;
  if (now.getTime() > edition.endsAt.getTime()) return "FINISHED";
  if (now.getTime() < edition.startsAt.getTime()) return "SCHEDULED";
  if (edition.status === "PAUSED") return "PAUSED";
  return "ACTIVE";
}
