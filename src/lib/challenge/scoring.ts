/**
 * Puntuación del Sweet Click Challenge (lógica pura, sin navegador).
 *
 * Etapa 1: el puntaje es local y demostrativo. La regla está aislada acá para
 * que, cuando exista el servidor, la misma función recalcule el puntaje a
 * partir de los toques (el navegador nunca va a enviar un número final).
 *
 * Tiempos en ms relativos al inicio de la partida.
 */
export const GAME_DURATION_MS = 15_000;
/** Últimos segundos con efecto de urgencia. */
export const URGENT_MS = 5_000;
/** Mordidas para terminar una cookie. */
export const BITES_PER_COOKIE = 30;
/** Dos toques contados nunca están más cerca que esto (filtra rebotes y dobles disparos). */
export const MIN_TAP_INTERVAL_MS = 40;
/** Tope de toques contados en cualquier ventana de 1 s (lo que exceda no suma, no descalifica). */
export const MAX_TAPS_PER_SECOND = 20;

export type TapCounter = {
  readonly bites: number;
  readonly ignored: number;
  /** true si el toque cuenta como mordida. */
  tap(atMs: number): boolean;
};

export function createTapCounter(durationMs = GAME_DURATION_MS): TapCounter {
  // Últimos MAX_TAPS_PER_SECOND toques aceptados; `next` apunta al más viejo.
  const recent = new Array<number>(MAX_TAPS_PER_SECOND).fill(-Infinity);
  let next = 0;
  let last = -Infinity;
  let bites = 0;
  let ignored = 0;

  return {
    get bites() {
      return bites;
    },
    get ignored() {
      return ignored;
    },
    tap(atMs) {
      const valid =
        Number.isFinite(atMs) &&
        atMs >= 0 &&
        atMs < durationMs &&
        atMs - last >= MIN_TAP_INTERVAL_MS &&
        atMs - recent[next] >= 1000;
      if (!valid) {
        ignored++;
        return false;
      }
      recent[next] = atMs;
      next = (next + 1) % MAX_TAPS_PER_SECOND;
      last = atMs;
      bites++;
      return true;
    },
  };
}

/** Puntaje de una lista de toques (misma regla que el contador en vivo). */
export function scoreTaps(times: readonly number[], durationMs = GAME_DURATION_MS): { bites: number; ignored: number } {
  const counter = createTapCounter(durationMs);
  for (const t of times) counter.tap(t);
  return { bites: counter.bites, ignored: counter.ignored };
}

export function cookiesEaten(bites: number, perCookie = BITES_PER_COOKIE): number {
  return Math.floor(Math.max(0, bites) / perCookie);
}

/** Tiempo restante con un decimal y coma: 15000 → "15,0", 4210 → "4,3", 0 → "0,0". */
export function formatTimer(remainingMs: number): string {
  const tenths = Math.ceil(Math.max(0, remainingMs) / 100);
  return (tenths / 10).toFixed(1).replace(".", ",");
}
