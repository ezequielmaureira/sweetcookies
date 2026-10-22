/**
 * Textos y fechas del campeonato (lógica pura). Las fechas se muestran siempre
 * en hora de Córdoba, sin importar la zona del teléfono.
 */
export const CHALLENGE_TIME_ZONE = "America/Argentina/Cordoba";

const pad = (n: number) => String(n).padStart(2, "0");

/** 2 d 04 h 12 min · o 04:12:33 si falta menos de un día. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days} d ${pad(hours)} h ${pad(minutes)} min`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const dateTime = new Intl.DateTimeFormat("es-AR", {
  timeZone: CHALLENGE_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "viernes 24/10, 23:59" (hora de Córdoba). */
export const formatCordobaDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(/\s+/g, " ");

/** Intentos oficiales del torneo semanal (no se renuevan cada día). */
export const attemptsText = (left: number) => (left === 1 ? "Te queda 1 intento oficial" : `Te quedan ${left} intentos oficiales`);

/** URL del perfil a partir del @ configurado ("@sweet.cookies.rio4"). */
export const instagramUrl = (handle: string) => `https://www.instagram.com/${encodeURIComponent(handle.replace(/^@/, ""))}/`;

export const bitesText = (n: number) => (n === 1 ? "1 mordida" : `${n} mordidas`);
export const cookiesText = (n: number) => (n === 1 ? "1 cookie" : `${n} cookies`);

export type ChallengePhase = "upcoming" | "competition" | "paused" | "review" | "closed";

/**
 * Momento de la semana para los textos: lunes a viernes se compite, el sábado
 * se revisa y se publica el ganador, el domingo está cerrado.
 */
export function challengePhase(edition: { status: string; reviewEndsAt: string }, nowMs: number | null): ChallengePhase {
  if (edition.status === "SCHEDULED") return "upcoming";
  if (edition.status === "ACTIVE") return "competition";
  if (edition.status === "PAUSED") return "paused";
  return nowMs !== null && nowMs > Date.parse(edition.reviewEndsAt) ? "closed" : "review";
}
