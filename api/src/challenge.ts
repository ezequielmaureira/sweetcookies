/**
 * Sweet Click Challenge: reglas, validación, puntaje y señales de sospecha
 * (lógica pura, sin base de datos).
 *
 * El navegador manda los TOQUES; el puntaje lo calcula siempre el servidor con
 * las mismas reglas del juego (src/lib/challenge/scoring.ts en la web). Los
 * toques también podrían falsificarse: por eso además se marcan patrones
 * anormales para revisión humana. No es una protección infalible.
 */
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { weekSchedule, type ChallengeStatus } from "./challenge-time.ts";

/* ---------- Reglas ---------- */

export const GAME_DURATION_MS = 15_000;
/** Intentos oficiales por participante en TODA la edición semanal (no por día). */
export const ATTEMPTS_PER_EDITION = 3;
export const BITES_PER_COOKIE = 30;
export const MIN_TAP_INTERVAL_MS = 40;
export const MAX_TAPS_PER_SECOND = 20;
/** Toque válido: dentro del círculo de la cookie (centro 50/50, radio en % del lado). */
export const HIT_RADIUS = 54;
/** Toques que se aceptan en el cuerpo (más que el máximo contable: 300). */
export const MAX_TAPS = 600;
/** Margen para cerrar una partida (reintentos por mala conexión). Después vence sin puntaje. */
export const FINISH_GRACE_MS = 10 * 60 * 1000;
export const PRIZE = "Caja de 3 cookies";
export const TERMS_VERSION = "2026-10-borrador-2";
/** Vigencia del código de recuperación que genera el admin. */
export const RECOVERY_TTL_MS = 48 * 60 * 60 * 1000;
export const TOP_SIZE = 10;

export const cookiesFor = (bites: number) => Math.floor(Math.max(0, bites) / BITES_PER_COOKIE);

/* ---------- Puntaje (misma regla que el juego) ---------- */

export type Tap = { t: number; x: number; y: number };

/**
 * Mordidas válidas: dentro de la cookie, entre 0 y la duración, a 40 ms o más
 * de la anterior y nunca más de 20 en una ventana de 1 s.
 */
export function scoreTaps(taps: readonly Tap[], durationMs = GAME_DURATION_MS): { accepted: number[]; ignored: number } {
  const recent = new Array<number>(MAX_TAPS_PER_SECOND).fill(-Infinity);
  let next = 0;
  let last = -Infinity;
  const accepted: number[] = [];
  let ignored = 0;
  for (const { t, x, y } of taps) {
    const valid =
      Math.hypot(x - 50, y - 50) <= HIT_RADIUS &&
      t >= 0 &&
      t < durationMs &&
      t - last >= MIN_TAP_INTERVAL_MS &&
      t - recent[next] >= 1000;
    if (!valid) {
      ignored++;
      continue;
    }
    recent[next] = t;
    next = (next + 1) % MAX_TAPS_PER_SECOND;
    last = t;
    accepted.push(t);
  }
  return { accepted, ignored };
}

/* ---------- Señales de sospecha ---------- */

export type Suspicion = "NONE" | "LOW" | "HIGH";

export const FLAG_LABELS: Record<string, string> = {
  TOO_REGULAR: "Ritmo demasiado regular (posible autoclicker)",
  SAME_SPOT: "Casi todos los toques en el mismo punto exacto",
  UNTRUSTED_EVENTS: "Eventos generados por script en el navegador",
  EXCEPTIONAL_SCORE: "Puntaje excepcional (revisar)",
  MANY_IGNORED: "Muchos toques por encima del límite",
};

const HIGH_FLAGS = new Set(["TOO_REGULAR", "SAME_SPOT", "UNTRUSTED_EVENTS"]);

/**
 * Patrones anormales. Solo marcan para revisión: nunca descalifican solos
 * (jugar muy rápido no es motivo suficiente).
 */
export function assessGame(taps: readonly Tap[], accepted: readonly number[], ignored: number, untrusted: number): { flags: string[]; suspicion: Suspicion } {
  const flags: string[] = [];
  if (accepted.length >= 60) {
    const gaps = accepted.slice(1).map((t, i) => t - accepted[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    if (mean > 0 && sd / mean < 0.06) flags.push("TOO_REGULAR");

    const spots = new Map<string, number>();
    for (const { x, y } of taps) spots.set(`${x},${y}`, (spots.get(`${x},${y}`) ?? 0) + 1);
    if (Math.max(...spots.values()) >= taps.length * 0.9) flags.push("SAME_SPOT");
  }
  if (untrusted > 0) flags.push("UNTRUSTED_EVENTS");
  if (accepted.length >= 210) flags.push("EXCEPTIONAL_SCORE");
  if (taps.length >= 50 && ignored > taps.length * 0.3) flags.push("MANY_IGNORED");
  const suspicion: Suspicion = flags.some((f) => HIGH_FLAGS.has(f)) ? "HIGH" : flags.length ? "LOW" : "NONE";
  return { flags, suspicion };
}

/* ---------- Cuerpo de cierre de partida ---------- */

export type FinishInput = { taps: Tap[]; untrusted: number };

/** { taps: [t, x, y, t, x, y, …], untrusted: número } → toques validados. */
export function parseFinishInput(body: unknown, durationMs = GAME_DURATION_MS): { ok: true; data: FinishInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body" };
  const { taps, untrusted } = body as { taps?: unknown; untrusted?: unknown };
  if (!Array.isArray(taps) || taps.length % 3 !== 0 || taps.length > MAX_TAPS * 3) return { ok: false, error: "taps" };
  const parsed: Tap[] = [];
  for (let i = 0; i < taps.length; i += 3) {
    const [t, x, y] = [taps[i], taps[i + 1], taps[i + 2]];
    if (![t, x, y].every((n) => Number.isInteger(n))) return { ok: false, error: "taps" };
    if (t < 0 || t > durationMs + 1000 || x < 0 || x > 100 || y < 0 || y > 100) return { ok: false, error: "taps" };
    parsed.push({ t, x, y });
  }
  const untrustedCount = Number.isInteger(untrusted) && (untrusted as number) >= 0 ? Math.min(untrusted as number, MAX_TAPS) : 0;
  return { ok: true, data: { taps: parsed, untrusted: untrustedCount } };
}

export const flattenTaps = (taps: readonly Tap[]) => taps.flatMap(({ t, x, y }) => [t, x, y]);


/* ---------- Participación: solo el @ de Instagram ---------- */

/** Usuario de Instagram: sin @ ni URL, en minúsculas. */
export function normalizeInstagram(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[/?#].*$/, "");
  value = value.replace(/^@/, "");
  if (!/^[a-z0-9._]{1,30}$/.test(value) || value.includes("..") || /^\.|\.$/.test(value)) return null;
  return value;
}

export type JoinErrors = Partial<Record<"instagram" | "terms" | "body", string>>;

/** Para competir se pide únicamente el @ (y aceptar las bases). */
export function validateJoin(body: unknown): { ok: true; instagram: string } | { ok: false; errors: JoinErrors } {
  if (!body || typeof body !== "object") return { ok: false, errors: { body: "Datos inválidos." } };
  const input = body as Record<string, unknown>;
  const errors: JoinErrors = {};
  const instagram = normalizeInstagram(typeof input.instagram === "string" ? input.instagram : "");
  if (!instagram) errors.instagram = "Escribí tu usuario de Instagram (ej. @tuusuario).";
  if (input.terms !== true) errors.terms = "Tenés que aceptar las bases y condiciones.";
  if (!instagram || errors.terms) return { ok: false, errors };
  return { ok: true, instagram };
}

/* ---------- Reclamo del premio (solo el ganador confirmado) ---------- */

/** Nombre: letras, espacios, apóstrofo, punto y guion; espacios colapsados. */
export function normalizeName(raw: string): string | null {
  const value = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return value.length >= 2 && value.length <= 60 && /^\p{L}[\p{L} '.-]*$/u.test(value) ? value : null;
}

/**
 * WhatsApp argentino → 549 + 10 dígitos. Acepta +54 9, 0 de larga distancia y
 * el 15 después del código de área (ej. "0358 15 412-3456" → 5493584123456).
 */
export function normalizeArgentinePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9") && digits.length === 11) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12) {
    for (const areaLength of [4, 3, 2]) {
      if (digits.slice(areaLength, areaLength + 2) === "15") {
        digits = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
        break;
      }
    }
  }
  return /^[1-9]\d{9}$/.test(digits) ? `549${digits}` : null;
}

export type ClaimInput = { name: string; phone: string };
export type ClaimErrors = Partial<Record<"name" | "phone" | "body", string>>;

export function validateClaim(body: unknown): { ok: true; data: ClaimInput } | { ok: false; errors: ClaimErrors } {
  if (!body || typeof body !== "object") return { ok: false, errors: { body: "Datos inválidos." } };
  const input = body as Record<string, unknown>;
  const name = normalizeName(typeof input.name === "string" ? input.name : "");
  const phone = normalizeArgentinePhone(typeof input.phone === "string" ? input.phone : "");
  const errors: ClaimErrors = {};
  if (!name) errors.name = "Escribí tu nombre (solo letras).";
  if (!phone) errors.phone = "Escribí un celular argentino con código de área (ej. 358 412-3456).";
  if (!name || !phone) return { ok: false, errors };
  return { ok: true, data: { name, phone } };
}

/* ---------- Sesión, recuperación e IP ---------- */

/** Token de 256 bits (base64url). Solo lo conoce el navegador del participante. */
export const generateToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isTokenShaped = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/** Sin letras que se confunden (I, O, 0, 1): se dicta por mensaje. */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Código de recuperación de un solo uso (50 bits): "ABCDE-FGH23". */
export function generateRecoveryCode(): string {
  const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]);
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

export const normalizeRecoveryCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryCode = (code: string) => createHash("sha256").update(`recovery:${normalizeRecoveryCode(code)}`).digest("hex");

/**
 * IP → HMAC-SHA256 con una clave del servidor (CHALLENGE_IP_SECRET). Permite
 * ver que dos participantes usaron la misma conexión sin guardar la IP. Sin
 * clave no se guarda nada.
 */
export const hashIp = (secret: string | null, ip: string | null) =>
  secret && ip ? createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32) : null;

/* ---------- Registros y repositorio ---------- */

export type EditionRecord = {
  id: string;
  isTest: boolean;
  number: number;
  weekStart: string;
  startsAt: Date;
  endsAt: Date;
  status: ChallengeStatus;
  gameDurationMs: number;
  attempts: number;
  prize: string;
  pausedAt: Date | null;
  pauseReason: string | null;
  winnerParticipantId: string | null;
  winnerGameId: string | null;
  winnerScore: number | null;
  resultsPublishedAt: Date | null;
};

export type ParticipantRecord = {
  id: string;
  instagram: string;
  ipHash: string | null;
  duplicateAttempts: number;
  lastDuplicateAt: Date | null;
  createdAt: Date;
};

export type GameStatus = "STARTED" | "FINISHED" | "EXPIRED";
export type Review = "NONE" | "PENDING" | "APPROVED" | "REJECTED";
export type ClaimStatus = "PENDING" | "CLAIMED" | "CONTACTED" | "DELIVERED";
export const CLAIM_ORDER: readonly ClaimStatus[] = ["PENDING", "CLAIMED", "CONTACTED", "DELIVERED"];

export type GameRecord = {
  id: string;
  editionId: string;
  participantId: string;
  attemptNumber: number;
  status: GameStatus;
  startedAt: Date;
  finishedAt: Date | null;
  ipHash: string | null;
  score: number | null;
  cookies: number | null;
  tapsReceived: number | null;
  tapsIgnored: number | null;
  untrustedTaps: number | null;
  flags: string[];
  suspicion: Suspicion;
  review: Review;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewReason: string | null;
};

/** Mejor partida válida de cada participante (ya ordenado: puntaje ↓, primero en lograrlo ↑). */
export type RankingRow = { participantId: string; instagram: string; score: number; achievedAt: Date; gameId: string };

export type GameResult = {
  score: number;
  cookies: number;
  tapsReceived: number;
  tapsIgnored: number;
  untrustedTaps: number;
  taps: number[];
  flags: string[];
  suspicion: Suspicion;
  finishedAt: Date;
};

export type ClaimRecord = {
  editionId: string;
  editionNumber: number;
  isTest: boolean;
  participantId: string;
  gameId: string;
  status: ClaimStatus;
  name: string | null;
  phone: string | null;
  claimedAt: Date | null;
  contactedAt: Date | null;
  deliveredAt: Date | null;
};

export type AdminRankingRow = RankingRow & {
  suspicion: Suspicion;
  review: Review;
  flags: string[];
  /** Intentos oficiales usados en la edición. */
  games: number;
};

export type AdminGameRow = GameRecord & { instagram: string; taps: number[] };

export type AdminParticipantRow = ParticipantRecord & {
  /** Intentos usados y mejor puntaje en la edición consultada. */
  attemptsUsed: number;
  best: number | null;
  lastSeenAt: Date | null;
  recoveryPending: boolean;
};

/** Posibles duplicados: varios @ desde la misma conexión (puede ser una familia: no se bloquea). */
export type DuplicateAlert = { ipHash: string; participants: { id: string; instagram: string }[] };

export type AdminAction = {
  id: string;
  action: string;
  reason: string | null;
  adminUserId: string;
  participantId: string | null;
  gameId: string | null;
  createdAt: Date;
};

export type DisqualificationRecord = { participantId: string; instagram: string; reason: string; createdBy: string; createdAt: Date };

export type EditionStats = { participants: number; games: number; finished: number; pendingReview: number };

/** El @ ya tiene una sesión en otro navegador. */
export class DuplicateParticipantError extends Error {
  constructor() {
    super("duplicate_participant");
  }
}

export type ChallengeRepository = {
  /** Edición de esa semana y tipo (prueba/oficial); si no existe se crea (nunca dos). */
  ensureEdition(window: { weekStart: string; startsAt: Date; endsAt: Date; isTest: boolean }): Promise<EditionRecord>;
  getEdition(id: string): Promise<EditionRecord | null>;
  listEditions(): Promise<EditionRecord[]>;

  /** DuplicateParticipantError si el @ ya existe. */
  createParticipant(data: { instagram: string; tokenHash: string; ipHash: string | null; now: Date }): Promise<ParticipantRecord>;
  /** Alguien intentó registrar un @ que ya tiene sesión: queda como alerta para el admin. */
  noteDuplicate(instagram: string, now: Date): Promise<void>;
  findParticipantByTokenHash(tokenHash: string, now: Date): Promise<ParticipantRecord | null>;
  /** Recuperación manual: guarda el hash del código que el admin le manda al participante. */
  setRecoveryCode(participantId: string, codeHash: string, expiresAt: Date, adminUserId: string): Promise<ParticipantRecord | null>;
  /** Canjea el código (un solo uso): reemplaza el token; la sesión anterior deja de valer. */
  recover(instagram: string, codeHash: string, tokenHash: string, now: Date): Promise<ParticipantRecord | null>;

  /** Intentos oficiales usados en la edición (iniciados, terminados o vencidos). */
  countAttempts(participantId: string, editionId: string): Promise<number>;
  /** Reserva el intento `attemptNumber` de la edición. null si otro pedido simultáneo ya lo tomó. */
  createGame(data: { editionId: string; participantId: string; attemptNumber: number; startedAt: Date; ipHash: string | null }): Promise<GameRecord | null>;
  getGame(id: string): Promise<GameRecord | null>;
  /** Cierre único: solo si sigue STARTED. null = ya estaba cerrada. */
  finishGame(id: string, result: GameResult): Promise<GameRecord | null>;
  expireGame(id: string): Promise<void>;

  ranking(editionId: string): Promise<RankingRow[]>;
  isDisqualified(editionId: string, participantId: string): Promise<boolean>;

  /** Premios del participante (más recientes primero). */
  claimsOf(participantId: string): Promise<ClaimRecord[]>;
  /** Nombre y celular del ganador: solo su sesión, solo una vez (PENDING → CLAIMED). null = no corresponde. */
  submitClaim(editionId: string, participantId: string, data: ClaimInput, now: Date): Promise<ClaimRecord | null>;
  getClaim(editionId: string): Promise<ClaimRecord | null>;
  setClaimStatus(editionId: string, status: "CONTACTED" | "DELIVERED", reason: string | null, adminUserId: string): Promise<ClaimRecord | null>;

  stats(editionId: string): Promise<EditionStats>;
  adminRanking(editionId: string): Promise<AdminRankingRow[]>;
  listGames(editionId: string, filter: "all" | "suspicious"): Promise<AdminGameRow[]>;
  listParticipants(editionId: string): Promise<AdminParticipantRow[]>;
  duplicateAlerts(editionId: string): Promise<DuplicateAlert[]>;
  listDisqualifications(editionId: string): Promise<DisqualificationRecord[]>;
  listActions(editionId: string): Promise<AdminAction[]>;

  setPaused(editionId: string, paused: boolean, reason: string | null, adminUserId: string): Promise<EditionRecord | null>;
  reviewGame(gameId: string, decision: "APPROVED" | "REJECTED", reason: string, adminUserId: string): Promise<GameRecord | null>;
  disqualify(editionId: string, participantId: string, reason: string, adminUserId: string): Promise<boolean>;
  reinstate(editionId: string, participantId: string, reason: string, adminUserId: string): Promise<boolean>;
  /** Confirma el ganador y crea su premio pendiente de reclamo. */
  publishResults(editionId: string, winner: RankingRow | null, adminUserId: string, reason: string | null): Promise<EditionRecord | null>;
};

/* ---------- Respuestas ---------- */

export const handleOf = (instagram: string) => `@${instagram}`;

export const publicEdition = (edition: EditionRecord, now: Date, status: ChallengeStatus) => {
  const { reviewEndsAt, nextStartsAt } = weekSchedule(edition.weekStart);
  return {
    id: edition.id,
    number: edition.number,
    isTest: edition.isTest,
    startsAt: edition.startsAt.toISOString(),
    endsAt: edition.endsAt.toISOString(),
    reviewEndsAt: reviewEndsAt.toISOString(),
    nextStartsAt: nextStartsAt.toISOString(),
    status,
    gameDurationMs: edition.gameDurationMs,
    attempts: edition.attempts,
    bitesPerCookie: BITES_PER_COOKIE,
    prize: edition.prize,
    serverNow: now.toISOString(),
  };
};

/** Fila pública: solo @, mordidas y cookies (nunca IP, teléfono ni ids). */
export const publicRow = (row: RankingRow, position: number) => ({
  position,
  handle: handleOf(row.instagram),
  score: row.score,
  cookies: cookiesFor(row.score),
});

/** Motivo de un admin: obligatorio, 3–300 caracteres. */
export function parseReason(body: unknown, required = true): { ok: true; reason: string | null } | { ok: false } {
  const raw = body && typeof body === "object" ? (body as { reason?: unknown }).reason : undefined;
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!reason) return required ? { ok: false } : { ok: true, reason: null };
  if (reason.length < 3 || reason.length > 300) return { ok: false };
  return { ok: true, reason };
}
