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
import { parseCordobaDateTime, type ChallengeStatus } from "./challenge-time.ts";

/* ---------- Reglas ---------- */

export const GAME_DURATION_MS = 15_000;
/** Intentos oficiales por participante: los define el admin en cada torneo, dentro de este rango. */
export const MIN_ATTEMPTS = 1;
export const MAX_ATTEMPTS = 20;
/** Duración de un torneo: de 15 minutos a 90 días. */
export const MIN_TOURNAMENT_MS = 15 * 60 * 1000;
export const MAX_TOURNAMENT_MS = 90 * 24 * 60 * 60 * 1000;
export const BITES_PER_COOKIE = 30;
export const MIN_TAP_INTERVAL_MS = 40;
export const MAX_TAPS_PER_SECOND = 20;
/** Toque válido: dentro del círculo de la cookie (centro 50/50, radio en % del lado). */
export const HIT_RADIUS = 54;
/** Toques que se aceptan en el cuerpo (más que el máximo contable: 300). */
export const MAX_TAPS = 600;
/** Margen para cerrar una partida (reintentos por mala conexión). Después vence sin puntaje. */
export const FINISH_GRACE_MS = 10 * 60 * 1000;
/**
 * Partida que empezó ANTES del cierre del torneo y termina después: se acepta
 * su cierre solo hasta este margen técnico pasado el fin de sus 15 s (o del
 * torneo, lo que sea más tarde). Nunca se aceptan partidas que empiecen después.
 */
export const CLOSE_GRACE_MS = 2 * 60 * 1000;
export const TERMS_VERSION = "2026-10-borrador-4";
/** Vigencia del código de recuperación que genera el admin. */
export const RECOVERY_TTL_MS = 48 * 60 * 60 * 1000;
export const TOP_SIZE = 10;

export const cookiesFor = (bites: number) => Math.floor(Math.max(0, bites) / BITES_PER_COOKIE);

/** Hasta cuándo se acepta el cierre de una partida (ver CLOSE_GRACE_MS). */
export function finishDeadline(startedAt: Date, durationMs: number, endsAt: Date): number {
  const played = startedAt.getTime() + durationMs;
  const normal = played + FINISH_GRACE_MS;
  return normal <= endsAt.getTime() ? normal : Math.min(normal, Math.max(played, endsAt.getTime()) + CLOSE_GRACE_MS);
}

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


/* ---------- Participación: @ de Instagram, nombre y WhatsApp ---------- */

/** Usuario de Instagram: sin @ ni URL, en minúsculas. */
export function normalizeInstagram(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[/?#].*$/, "");
  value = value.replace(/^@/, "");
  if (!/^[a-z0-9._]{1,30}$/.test(value) || value.includes("..") || /^\.|\.$/.test(value)) return null;
  return value;
}

/** Nombre: letras, espacios, apóstrofo, punto y guion; espacios colapsados. */
export function normalizeName(raw: string): string | null {
  const value = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return value.length >= 2 && value.length <= 60 && /^\p{L}[\p{L} '.-]*$/u.test(value) ? value : null;
}

/** Nombre y apellido: como normalizeName, con al menos dos palabras. */
export function normalizeFullName(raw: string): string | null {
  const value = normalizeName(raw);
  return value && value.split(" ").filter((w) => /\p{L}/u.test(w)).length >= 2 ? value : null;
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

/**
 * WhatsApp en formato internacional, solo dígitos (sin +). Sin código de país
 * se toma como argentino (ver normalizeArgentinePhone). Un número de otro país
 * se escribe con + o 00 y su código: 8 a 15 dígitos en total (E.164).
 */
export function normalizePhone(raw: string): string | null {
  const value = raw.trim();
  if (!value || /[^\d\s()+.\-/]/.test(value)) return null;
  const international = /^(\+|00)/.test(value);
  const digits = value.replace(/\D/g, "").replace(/^00/, "");
  if (!international || digits.startsWith("54")) return normalizeArgentinePhone(value);
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** Últimos 4 dígitos (para que el participante reconozca su número sin exponerlo entero). */
export const phoneHint = (phone: string) => `•••• ${phone.slice(-4)}`;

export type ContactInput = { name: string; phone: string };
export type ContactErrors = Partial<Record<"name" | "phone" | "terms" | "body", string>>;

const PHONE_ERROR = "Escribí tu WhatsApp con código de área (ej. 358 412-3456). Si no es de Argentina, empezá con + y el código de país.";

/**
 * Nombre y apellido + WhatsApp + aceptación de las bases (que incluyen el
 * tratamiento de datos). Obligatorios para jugar.
 */
export function validateContact(body: unknown): { ok: true; data: ContactInput } | { ok: false; errors: ContactErrors } {
  if (!body || typeof body !== "object") return { ok: false, errors: { body: "Datos inválidos." } };
  const input = body as Record<string, unknown>;
  const errors: ContactErrors = {};
  const name = normalizeFullName(typeof input.name === "string" ? input.name : "");
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "");
  if (!name) errors.name = "Escribí tu nombre y apellido (solo letras).";
  if (!phone) errors.phone = PHONE_ERROR;
  if (input.terms !== true) errors.terms = "Tenés que aceptar las bases y condiciones y el tratamiento de tus datos.";
  if (!name || !phone || errors.terms) return { ok: false, errors };
  return { ok: true, data: { name, phone } };
}

export type JoinErrors = Partial<Record<"instagram" | "name" | "phone" | "terms" | "body", string>>;

/** Para competir: @ de Instagram, nombre y apellido, WhatsApp y aceptar las bases. */
export function validateJoin(body: unknown): { ok: true; instagram: string; contact: ContactInput } | { ok: false; errors: JoinErrors } {
  if (!body || typeof body !== "object") return { ok: false, errors: { body: "Datos inválidos." } };
  const input = body as Record<string, unknown>;
  const instagram = normalizeInstagram(typeof input.instagram === "string" ? input.instagram : "");
  const contact = validateContact(body);
  const errors: JoinErrors = contact.ok ? {} : { ...contact.errors };
  if (!instagram) errors.instagram = "Escribí tu usuario de Instagram (ej. @tuusuario).";
  if (!instagram || !contact.ok) return { ok: false, errors };
  return { ok: true, instagram, contact: contact.data };
}

/* ---------- Reclamo del premio (ganadores sin datos de contacto) ---------- */

export type ClaimInput = { name: string; phone: string };
export type ClaimErrors = Partial<Record<"name" | "phone" | "body", string>>;

export function validateClaim(body: unknown): { ok: true; data: ClaimInput } | { ok: false; errors: ClaimErrors } {
  if (!body || typeof body !== "object") return { ok: false, errors: { body: "Datos inválidos." } };
  const input = body as Record<string, unknown>;
  const name = normalizeName(typeof input.name === "string" ? input.name : "");
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "");
  const errors: ClaimErrors = {};
  if (!name) errors.name = "Escribí tu nombre (solo letras).";
  if (!phone) errors.phone = PHONE_ERROR;
  if (!name || !phone) return { ok: false, errors };
  return { ok: true, data: { name, phone } };
}

/* ---------- Torneos (los crea el admin) ---------- */

export type TournamentInput = {
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  prize: string;
  prizeDescription: string | null;
  /** Foto del premio (ruta de una imagen subida desde el panel) o null. */
  prizeImageUrl: string | null;
  attempts: number;
  isTest: boolean;
};

export type TournamentErrors = Partial<Record<"name" | "description" | "start" | "end" | "prize" | "prizeDescription" | "prizeImage" | "attempts" | "body", string>>;

/** Solo imágenes subidas desde el panel (nunca URLs externas): mismo sistema que las fotos de productos. */
const UPLOADED_IMAGE = /^\/api\/public\/images\/[a-z0-9]{10,40}$/;
export const isUploadedImagePath = (value: unknown): value is string => typeof value === "string" && UPLOADED_IMAGE.test(value);

const cleanText = (raw: unknown) => (typeof raw === "string" ? raw.normalize("NFC").replace(/\s+/g, " ").trim() : "");
const cleanLong = (raw: unknown) => (typeof raw === "string" ? raw.normalize("NFC").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "");

/**
 * Formulario del admin → torneo. Fechas en hora de Córdoba ("2026-10-30" +
 * "18:00"); el cierre dura hasta el final de ese minuto.
 */
export function validateTournament(body: unknown): { ok: true; data: TournamentInput } | { ok: false; errors: TournamentErrors } {
  if (!body || typeof body !== "object") return { ok: false, errors: { body: "Datos inválidos." } };
  const input = body as Record<string, unknown>;
  const errors: TournamentErrors = {};

  const name = cleanText(input.name);
  if (name.length < 3 || name.length > 80) errors.name = "El nombre es obligatorio (3 a 80 caracteres).";
  const description = cleanLong(input.description);
  if (description.length > 500) errors.description = "La descripción puede tener hasta 500 caracteres.";
  const prize = cleanText(input.prize);
  if (prize.length < 2 || prize.length > 120) errors.prize = "El premio es obligatorio (2 a 120 caracteres).";
  const prizeDescription = cleanLong(input.prizeDescription);
  if (prizeDescription.length > 500) errors.prizeDescription = "La descripción del premio puede tener hasta 500 caracteres.";
  // Opcional: sin foto se muestra el diseño de siempre.
  const rawImage = input.prizeImageUrl;
  const prizeImageUrl = rawImage === undefined || rawImage === null || rawImage === "" ? null : isUploadedImagePath(rawImage) ? rawImage : undefined;
  if (prizeImageUrl === undefined) errors.prizeImage = "La foto del premio no es válida: volvé a subirla.";

  const attempts = input.attempts;
  if (!Number.isInteger(attempts) || (attempts as number) < MIN_ATTEMPTS || (attempts as number) > MAX_ATTEMPTS) {
    errors.attempts = `Elegí entre ${MIN_ATTEMPTS} y ${MAX_ATTEMPTS} intentos.`;
  }

  const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
  const startsAt = parseCordobaDateTime(text("startDate"), text("startTime"));
  const endsAt = parseCordobaDateTime(text("endDate"), text("endTime"), true);
  if (!startsAt) errors.start = "Completá la fecha y la hora de inicio.";
  if (!endsAt) errors.end = "Completá la fecha y la hora de finalización.";
  if (startsAt && endsAt) {
    const duration = endsAt.getTime() - startsAt.getTime();
    if (duration <= 0) errors.end = "La finalización tiene que ser posterior al inicio.";
    else if (duration < MIN_TOURNAMENT_MS) errors.end = "El torneo tiene que durar al menos 15 minutos.";
    else if (duration > MAX_TOURNAMENT_MS) errors.end = "El torneo puede durar como máximo 90 días.";
  }

  if (Object.keys(errors).length || !startsAt || !endsAt) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      description: description || null,
      startsAt,
      endsAt,
      prize,
      prizeDescription: prizeDescription || null,
      prizeImageUrl: prizeImageUrl ?? null,
      attempts: attempts as number,
      // No hay modo prueba: todos los torneos nuevos son reales.
      isTest: false,
    },
  };
}

/** Diferencias entre el torneo guardado y el editado (para validar y registrar). */
export function tournamentChanges(current: EditionRecord, next: TournamentInput): string[] {
  const changes: string[] = [];
  if (current.name !== next.name) changes.push("name");
  if ((current.description ?? null) !== next.description) changes.push("description");
  if (current.startsAt.getTime() !== next.startsAt.getTime()) changes.push("startsAt");
  if (current.endsAt.getTime() !== next.endsAt.getTime()) changes.push("endsAt");
  if (current.prize !== next.prize) changes.push("prize");
  if ((current.prizeDescription ?? null) !== next.prizeDescription) changes.push("prizeDescription");
  if ((current.prizeImageUrl ?? null) !== next.prizeImageUrl) changes.push("prizeImage");
  if (current.attempts !== next.attempts) changes.push("attempts");
  return changes;
}

export type EditCheck = { ok: true; changes: string[] } | { ok: false; error: string; message: string };

/**
 * Reglas de edición que protegen la competencia:
 * - Borrador, o publicado/despublicado sin empezar y sin partidas: se puede
 *   cambiar todo.
 * - Ya empezado o con partidas: el inicio y el modo quedan fijos; el cierre
 *   solo se puede extender; los intentos solo pueden subir; cambiar el premio
 *   exige confirmación explícita; todo cambio exige motivo y queda registrado.
 * - Finalizado, con ganador publicado o cancelado: no se edita.
 */
export function checkTournamentEdit(
  current: EditionRecord,
  status: ChallengeStatus,
  next: TournamentInput,
  ctx: { games: number; reason: string | null; confirmPrizeChange: boolean; now: Date },
): EditCheck {
  const changes = tournamentChanges(current, next);
  if (current.deletedAt) return { ok: false, error: "deleted", message: "Este torneo fue eliminado: no se puede editar." };
  if (current.isTest) return { ok: false, error: "legacy", message: "Los torneos históricos de prueba no se editan. Podés eliminarlo y crear uno nuevo." };
  if (status === "FINISHED" || status === "RESULTS_PUBLISHED" || status === "CANCELLED") {
    return { ok: false, error: "locked", message: "Este torneo ya terminó: no se puede editar." };
  }
  const started = status !== "DRAFT" && (ctx.games > 0 || current.startsAt.getTime() <= ctx.now.getTime());
  if (!started) return { ok: true, changes };

  if (changes.includes("startsAt")) return { ok: false, error: "start_locked", message: "El torneo ya empezó: la fecha de inicio no se puede cambiar." };
  if (next.endsAt.getTime() < current.endsAt.getTime()) {
    return { ok: false, error: "end_shortened", message: "El torneo ya empezó: el cierre solo se puede extender, no adelantar." };
  }
  if (next.attempts < current.attempts) {
    return { ok: false, error: "attempts_reduced", message: "El torneo ya empezó: los intentos solo se pueden aumentar." };
  }
  if ((changes.includes("prize") || changes.includes("prizeDescription")) && !ctx.confirmPrizeChange) {
    return { ok: false, error: "prize_change_unconfirmed", message: "Cambiar el premio de un torneo en curso requiere confirmación." };
  }
  if (changes.length && !ctx.reason) {
    return { ok: false, error: "reason_required", message: "El torneo ya empezó: escribí el motivo del cambio (queda registrado)." };
  }
  return { ok: true, changes };
}

/** Dos torneos publicados nunca se superponen (uno activo a la vez). */
export const overlaps = (a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) =>
  a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();

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

/* ---------- Invitaciones (solo difusión: nunca dan intentos ni ventajas) ---------- */

const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Código público de un enlace de invitación: 10 caracteres aleatorios (~49 bits). No autentica. */
export const generateInviteCode = () => Array.from({ length: 10 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join("");
export const isInviteCode = (code: unknown): code is string => typeof code === "string" && /^[a-z2-9]{10}$/.test(code);

/** Id aleatorio del navegador del visitante (lo genera la página). Se guarda solo su hash. */
export const isVisitorId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(id);
export const hashVisitor = (id: string) => createHash("sha256").update(`visitor:${id}`).digest("hex");

/** Una misma conexión (IP) cuenta como mucho estas visitas por enlace (freno básico contra visitas infladas). */
export const MAX_VISITS_PER_CONNECTION = 5;

/** Id de pedido del botón "Jugar" (idempotencia del inicio de partida). */
export const isRequestId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{16,40}$/.test(id);

export type InviteRecord = { id: string; editionId: string; participantId: string; code: string; ipHash: string | null };

export type InviteStats = {
  /** Enlaces generados (no prueba que se hayan enviado). */
  invites: number;
  /** Visitantes distintos que abrieron un enlace. */
  visits: number;
  /** Registros nuevos atribuidos (sin contar los de la misma conexión que quien invitó). */
  registrations: number;
  /** Registros desde la misma conexión que quien invitó: se muestran aparte. */
  sameConnection: number;
  top: { participantId: string; instagram: string; visits: number; registrations: number; sameConnection: number }[];
};

/* ---------- Registros y repositorio ---------- */

/** Torneo (tabla histórica "challenge_editions"). */
export type EditionRecord = {
  id: string;
  isTest: boolean;
  number: number;
  name: string;
  description: string | null;
  weekStart: string | null;
  startsAt: Date;
  endsAt: Date;
  status: ChallengeStatus;
  gameDurationMs: number;
  attempts: number;
  prize: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  deletedAt: Date | null;
  deleteReason: string | null;
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
  /** Datos de contacto (privados). null = participante anterior que todavía no los dejó. */
  fullName: string | null;
  phone: string | null;
  contactUpdatedAt: Date | null;
};

/** Ya dejó nombre y WhatsApp: puede jugar. */
export const hasContact = (p: Pick<ParticipantRecord, "fullName" | "phone">) => Boolean(p.fullName && p.phone);

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
  /** Id del pedido de "Jugar" que creó la partida (idempotencia). */
  clientRequestId: string | null;
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
  editionName: string;
  prize: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  isTest: boolean;
  participantId: string;
  gameId: string;
  status: ClaimStatus;
  /** Datos con los que quedó el premio (copiados del registro al confirmar el ganador, o los que dejó al reclamar). */
  name: string | null;
  phone: string | null;
  claimedAt: Date | null;
  contactedAt: Date | null;
  deliveredAt: Date | null;
  /** @ del ganador y sus datos de contacto ACTUALES (solo para el panel). */
  instagram: string;
  current: { name: string | null; phone: string | null; updatedAt: Date | null };
};

export type AdminRankingRow = RankingRow & {
  suspicion: Suspicion;
  review: Review;
  flags: string[];
  /** Intentos oficiales usados en el torneo. */
  games: number;
};

export type AdminGameRow = GameRecord & { instagram: string; taps: number[] };

/** Participante en el panel: SIN teléfono (minimización); solo si tiene los datos completos. */
export type AdminParticipantRow = Omit<ParticipantRecord, "phone"> & {
  /** Intentos usados y mejor puntaje en el torneo consultado. */
  attemptsUsed: number;
  best: number | null;
  lastSeenAt: Date | null;
  recoveryPending: boolean;
  hasContact: boolean;
  /** El mismo WhatsApp figura en otro @ (posible duplicado: solo se revisa). */
  sharedPhone: boolean;
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

/** Torneo + cuántos participantes y partidas tiene (listado del panel). */
export type EditionSummary = EditionRecord & { participants: number; games: number };

export type DeletionInfo = {
  participants: number;
  games: number;
  invites: number;
  referrals: number;
  winnerPublished: boolean;
  claimStatus: ClaimStatus | null;
  /** "hard" = sin actividad (se borra definitivamente); "soft" = eliminación lógica. */
  mode: "hard" | "soft";
};

export type SaveResult = { ok: true; edition: EditionRecord } | { ok: false; conflict: { id: string; name: string } } | { ok: false; conflict: null };

/** El @ ya tiene una sesión en otro navegador. */
export class DuplicateParticipantError extends Error {
  constructor() {
    super("duplicate_participant");
  }
}

export type ChallengeRepository = {
  /**
   * Torneos reales publicados para la página: el que está en curso, el último
   * terminado y el próximo. `legacy` = el histórico de prueba (solo se muestra si
   * no hay ningún torneo real que mostrar).
   */
  publicTournaments(now: Date): Promise<{ live: EditionRecord | null; lastEnded: EditionRecord | null; next: EditionRecord | null; legacy: EditionRecord | null }>;
  getEdition(id: string): Promise<EditionRecord | null>;
  listEditions(): Promise<EditionSummary[]>;
  /**
   * Alta, edición y publicación. Si el resultado queda publicado, se verifica
   * (con bloqueo) que no se superponga con otro torneo publicado.
   */
  /** Crear SIEMPRE deja el torneo en borrador: publicarlo es otra decisión del admin. */
  createEdition(data: TournamentInput, adminUserId: string): Promise<SaveResult>;
  updateEdition(id: string, data: TournamentInput, changes: string[], reason: string | null, adminUserId: string): Promise<SaveResult>;
  /** Publicar (borrador o despublicado → visible). Verifica superposición con bloqueo. */
  publishEdition(id: string, adminUserId: string): Promise<SaveResult>;
  /** Despublicar: deja de verse y de aceptar partidas; conserva todo. */
  unpublishEdition(id: string, reason: string | null, adminUserId: string): Promise<EditionRecord | null>;
  /** Finalizar ahora: no acepta más partidas; el cierre pasa a ser este momento. */
  finishEdition(id: string, now: Date, reason: string | null, adminUserId: string): Promise<EditionRecord | null>;
  cancelEdition(id: string, reason: string, adminUserId: string): Promise<EditionRecord | null>;
  /** Qué tiene el torneo antes de eliminarlo (para advertir y decidir definitiva o lógica). */
  deletionInfo(id: string): Promise<DeletionInfo | null>;
  /** Sin actividad: se borra de verdad. Con actividad: eliminación lógica (conserva el historial). */
  deleteEdition(id: string, reason: string | null, adminUserId: string): Promise<{ mode: "hard" | "soft" } | null>;
  /** Torneos cerrados (fin vencido) que esperan confirmar el ganador. */
  countPendingWinners(now: Date): Promise<number>;

  /** DuplicateParticipantError si el @ ya existe. */
  createParticipant(data: { instagram: string; contact: ContactInput; tokenHash: string; ipHash: string | null; now: Date }): Promise<ParticipantRecord>;
  /**
   * El participante (su sesión) deja o actualiza su nombre y WhatsApp. Si es un
   * ganador anterior que todavía no los había dejado, su premio pendiente los toma.
   */
  updateContact(participantId: string, contact: ContactInput, now: Date): Promise<ParticipantRecord | null>;
  /** Borra los datos de contacto a pedido del participante (los vuelve a pedir antes de jugar). */
  eraseContact(participantId: string, reason: string | null, adminUserId: string): Promise<boolean>;
  /** Alguien intentó registrar un @ que ya tiene sesión: queda como alerta para el admin. */
  noteDuplicate(instagram: string, now: Date): Promise<void>;
  findParticipantByTokenHash(tokenHash: string, now: Date): Promise<ParticipantRecord | null>;
  /** Recuperación manual: guarda el hash del código que el admin le manda al participante. */
  setRecoveryCode(participantId: string, codeHash: string, expiresAt: Date, adminUserId: string): Promise<ParticipantRecord | null>;
  /** Canjea el código (un solo uso): reemplaza el token; la sesión anterior deja de valer. */
  recover(instagram: string, codeHash: string, tokenHash: string, now: Date): Promise<ParticipantRecord | null>;

  /** Partidas del torneo (cualquier estado). */
  countGames(editionId: string): Promise<number>;
  /** Intentos oficiales usados en el torneo (iniciados, terminados o vencidos). */
  countAttempts(participantId: string, editionId: string): Promise<number>;
  /** Reserva el intento `attemptNumber` del torneo. null si otro pedido simultáneo ya lo tomó. */
  createGame(data: { editionId: string; participantId: string; attemptNumber: number; startedAt: Date; ipHash: string | null; clientRequestId: string | null }): Promise<GameRecord | null>;
  /** Partida ya creada por ese mismo pedido (reintento o doble toque). */
  findGameByRequest(participantId: string, clientRequestId: string): Promise<GameRecord | null>;
  getGame(id: string): Promise<GameRecord | null>;
  /** Cierre único: solo si sigue STARTED. null = ya estaba cerrada. */
  finishGame(id: string, result: GameResult): Promise<GameRecord | null>;
  expireGame(id: string): Promise<void>;

  ranking(editionId: string): Promise<RankingRow[]>;
  isDisqualified(editionId: string, participantId: string): Promise<boolean>;

  /** Enlace del participante para ese torneo (lo crea si no existe). */
  getOrCreateInvite(editionId: string, participantId: string, ipHash: string | null): Promise<InviteRecord>;
  findInviteByCode(code: string): Promise<InviteRecord | null>;
  /** Visita única por visitante (y como mucho MAX_VISITS_PER_CONNECTION por conexión). true = contada. */
  recordVisit(inviteId: string, visitorHash: string, ipHash: string | null): Promise<boolean>;
  /** Registro nuevo atribuido (una vez por persona y torneo, nunca a sí misma). true = contado. */
  recordReferral(data: { editionId: string; inviteId: string; referrerId: string; referredId: string; sameConnection: boolean }): Promise<boolean>;
  inviteStats(editionId: string): Promise<InviteStats>;

  /** Premios del participante (más recientes primero). */
  claimsOf(participantId: string): Promise<ClaimRecord[]>;
  /** Nombre y celular del ganador sin datos registrados: solo su sesión, solo una vez (PENDING → CLAIMED). null = no corresponde. */
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
  /** Confirma el ganador y crea su premio, con los datos que dejó al registrarse (si los tiene). */
  publishResults(editionId: string, winner: RankingRow | null, adminUserId: string, reason: string | null): Promise<EditionRecord | null>;
};

/* ---------- Respuestas ---------- */

export const handleOf = (instagram: string) => `@${instagram}`;

/** Lo que ve el jugador de un torneo (sin datos internos del admin). */
export const publicEdition = (edition: EditionRecord, now: Date, status: ChallengeStatus) => ({
  id: edition.id,
  name: edition.name,
  description: edition.description,
  isTest: edition.isTest,
  startsAt: edition.startsAt.toISOString(),
  endsAt: edition.endsAt.toISOString(),
  status,
  gameDurationMs: edition.gameDurationMs,
  attempts: edition.attempts,
  bitesPerCookie: BITES_PER_COOKIE,
  prize: edition.prize,
  prizeDescription: edition.prizeDescription,
  prizeImageUrl: edition.prizeImageUrl,
  serverNow: now.toISOString(),
});

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
