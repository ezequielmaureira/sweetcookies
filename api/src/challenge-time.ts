/**
 * Calendario del Sweet Click Challenge (lógica pura).
 *
 * La autoridad es la hora del SERVIDOR leída en America/Argentina/Cordoba
 * (nunca la zona del navegador). Se usa Intl para convertir, así no depende de
 * que Argentina siga sin horario de verano.
 *
 * Semana: lunes 00:00:00.000 a viernes 23:59:59.999 se compite; el sábado se
 * revisan y publican los resultados; el domingo está cerrado; el lunes
 * siguiente empieza otra edición con 3 intentos nuevos.
 */
export const CHALLENGE_TIME_ZONE = "America/Argentina/Cordoba";

const DAY_MS = 24 * 60 * 60 * 1000;

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
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Día calendario en Córdoba (YYYY-MM-DD). */
export function cordobaDay(date: Date): string {
  const w = wall(date);
  return dateKey(w.year, w.month, w.day);
}

/** Suma días a una fecha calendario (sin horas: no le afecta ninguna zona). */
function addDays(key: string, days: number): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** 00:00 del día siguiente en Córdoba. */
export function nextCordobaMidnight(now: Date): Date {
  const next = addDays(cordobaDay(now), 1);
  return cordobaToUtc(next.year, next.month, next.day);
}

export type WeekWindow = {
  /** Lunes (YYYY-MM-DD, Córdoba): identifica la edición. */
  weekStart: string;
  /** Lunes 00:00:00.000 en Córdoba. */
  startsAt: Date;
  /** Viernes 23:59:59.999 en Córdoba. */
  endsAt: Date;
};

/** Semana (lunes a domingo, Córdoba) que contiene `now`. */
export function weekWindow(now: Date): WeekWindow {
  const today = cordobaDay(now);
  const [y, m, d] = today.split("-").map(Number);
  // 0 = lunes … 6 = domingo (el día de la semana de una fecha calendario no depende de la zona).
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  const friday = addDays(today, 4 - weekday);
  return {
    weekStart: dateKey(monday.year, monday.month, monday.day),
    startsAt: cordobaToUtc(monday.year, monday.month, monday.day),
    endsAt: cordobaToUtc(friday.year, friday.month, friday.day, 23, 59, 59, 999),
  };
}

/**
 * Sábado 23:59:59.999 (fin del día de revisión) y lunes 00:00 siguiente (nueva
 * edición con intentos nuevos) de la semana que empieza en `weekStart`.
 */
export function weekSchedule(weekStart: string): { reviewEndsAt: Date; nextStartsAt: Date } {
  const saturday = addDays(weekStart, 5);
  const nextMonday = addDays(weekStart, 7);
  return {
    reviewEndsAt: cordobaToUtc(saturday.year, saturday.month, saturday.day, 23, 59, 59, 999),
    nextStartsAt: cordobaToUtc(nextMonday.year, nextMonday.month, nextMonday.day),
  };
}

export type ChallengeStatus = "SCHEDULED" | "ACTIVE" | "PAUSED" | "FINISHED" | "RESULTS_PUBLISHED";

/**
 * Estado real de una edición: el guardado + la fecha. Después del viernes
 * 23:59:59 nunca está activa, aunque nadie la haya cerrado (cierre automático).
 */
export function effectiveStatus(edition: { status: ChallengeStatus; startsAt: Date; endsAt: Date }, now: Date): ChallengeStatus {
  if (edition.status === "RESULTS_PUBLISHED") return "RESULTS_PUBLISHED";
  if (now.getTime() > edition.endsAt.getTime()) return "FINISHED";
  if (edition.status === "PAUSED") return "PAUSED";
  if (now.getTime() < edition.startsAt.getTime()) return "SCHEDULED";
  return "ACTIVE";
}
