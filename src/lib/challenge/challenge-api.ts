/**
 * Cliente del Sweet Click Challenge (navegador).
 *
 * La sesión del participante es un token aleatorio que entrega el servidor al
 * registrarse: se guarda solo en este navegador (localStorage) y se manda como
 * Authorization: Bearer. El servidor guarda únicamente su hash.
 *
 * Para competir se piden el @ de Instagram, nombre y apellido y WhatsApp (estos
 * dos son privados: solo sirven para avisarle si gana). No hay práctica: toda partida es
 * oficial, la reserva el servidor y consume un intento del torneo activo.
 * Cada torneo (fechas, premio, intentos) lo crea el admin.
 */
import { apiUrl, fetchWithTimeout } from "@/lib/api";

export type ChallengeStatus = "DRAFT" | "UNPUBLISHED" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "FINISHED" | "RESULTS_PUBLISHED" | "CANCELLED";

/** Torneo tal como lo ve el jugador. El estado lo calcula el servidor con su hora. */
export type Tournament = {
  id: string;
  name: string;
  description: string | null;
  /** Torneo histórico de prueba (anterior a los torneos reales): sin premio. */
  isTest: boolean;
  startsAt: string;
  endsAt: string;
  status: ChallengeStatus;
  gameDurationMs: number;
  /** Intentos oficiales por participante en este torneo. */
  attempts: number;
  /** Mínimo de participantes válidos para entregar el premio. null = torneo anterior a la regla. */
  minParticipants: number | null;
  bitesPerCookie: number;
  prize: string;
  prizeDescription: string | null;
  /** Foto del premio (ruta en la API) o null: sin foto se muestra el diseño de siempre. */
  prizeImageUrl: string | null;
  serverNow: string;
};

export type LeaderRow = { position: number; handle: string; score: number; cookies: number };

export type ChallengeInfo = {
  /** Torneo que muestra la página (en curso, recién terminado o próximo). null = sin torneos. */
  tournament: Tournament | null;
  /** Próximo torneo programado, si el principal es otro. */
  next: Tournament | null;
  serverNow: string;
  leaderboard: LeaderRow[];
  ranked: number;
  winner: { handle: string; score: number; cookies: number } | null;
  /** Mínimo del torneo que se muestra (solo conteos). null = sin mínimo. */
  minimum: { required: number; valid: number; reached: boolean } | null;
  instagramHandle: string | null;
  /** Resultado del enlace ?torneo=: "invalid" si no existe o no es visible; "removed" si se eliminó. */
  linkStatus: "ok" | "invalid" | "removed" | null;
};

export type Attempts = { limit: number; used: number; left: number };
export type Standing = { position: number; score: number; cookies: number } | null;

export type ClaimStatus = "PENDING" | "CLAIMED" | "CONTACTED" | "DELIVERED";
export type PrizeClaim = {
  editionId: string;
  tournamentName: string;
  prize: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  isTest: boolean;
  status: ClaimStatus;
};

/**
 * Lo que el participante ve de sus propios datos: si están completos, su
 * nombre y solo los últimos 4 dígitos del WhatsApp.
 */
export type OwnContact = { complete: boolean; name: string | null; phoneHint: string | null };
export type OwnParticipant = { handle: string; contact: OwnContact };

export type Me = {
  participant: OwnParticipant;
  tournament: Tournament | null;
  /** null = no hay torneo. */
  attempts: Attempts | null;
  best: Standing;
  ranked: number;
  disqualified: boolean;
  /** Premios del jugador como primer puesto confirmado (sin datos de contacto). */
  claims: PrizeClaim[];
};

export type FinishResponse = {
  result: { score: number; cookies: number; best: Standing; ranked: number; newRecord: boolean; enteredTop10: boolean };
  attempts: Attempts;
  tournament: Tournament;
  repeated?: boolean;
};

export class ChallengeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown> = {}) {
    super(`challenge_api_${status}`);
    this.status = status;
    this.code = typeof data.error === "string" ? data.error : "";
    this.fields = (data.fields as Record<string, string>) ?? {};
    this.data = data;
  }
}

async function request<T>(path: string, init: { method?: string; token?: string | null; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const url = apiUrl(path);
  if (!url) throw new ChallengeApiError(0);
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      // El backend puede estar "dormido" (Fly): el primer pedido tarda más.
      timeoutMs: init.timeoutMs ?? 15000,
    });
  } catch {
    throw new ChallengeApiError(0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ChallengeApiError(res.status, data);
  return data as T;
}

const withTournament = (path: string, tournamentId: string | null) => (tournamentId ? `${path}?torneo=${encodeURIComponent(tournamentId)}` : path);

export const getChallenge = (tournamentId: string | null = null) => request<ChallengeInfo>(withTournament("/api/public/challenge", tournamentId));
export const getMe = (token: string, tournamentId: string | null = null) => request<Me>(withTournament("/api/challenge/me", tournamentId), { token });
type SessionResponse = { token: string; participant: OwnParticipant };

export type ContactData = { name: string; phone: string; terms: boolean };

/** `ref`: código del enlace por el que llegó (solo para medir la difusión; no da ventajas). */
export const register = (instagram: string, contact: ContactData, ref: string | null) =>
  request<SessionResponse>("/api/challenge/register", { method: "POST", body: { instagram, ...contact, ...(ref ? { ref } : {}) } });
/** Deja o corrige nombre y WhatsApp (solo con la propia sesión). No toca intentos ni puntajes. */
export const updateContact = (token: string, contact: ContactData) => request<{ participant: OwnParticipant }>("/api/challenge/contact", { method: "POST", token, body: contact });
export const recoverSession = (instagram: string, code: string) => request<SessionResponse>("/api/challenge/recover", { method: "POST", body: { instagram, code } });
export const claimPrize = (token: string, editionId: string, data: { name: string; phone: string }) =>
  request<{ claim: PrizeClaim }>(`/api/challenge/claims/${encodeURIComponent(editionId)}`, { method: "POST", token, body: data });
/** `requestId`: uno por toque de "Jugar"; si el pedido se repite, el servidor devuelve la misma partida (no gasta otro intento). */
export const startGame = (token: string, requestId: string) =>
  request<{ game: { id: string; durationMs: number; attemptNumber: number }; attempts: Attempts; replayed?: boolean }>("/api/challenge/games", {
    method: "POST",
    token,
    body: { requestId },
  });

/** Enlace personal para invitar amigos al torneo (código público, sin datos privados). */
export const createInvite = (token: string, tournamentId: string | null) =>
  request<{ code: string; tournamentId: string }>(withTournament("/api/challenge/invites", tournamentId), { method: "POST", token });

/** Avisa que se abrió un enlace de invitación (una visita por navegador). Nunca falla hacia la página. */
export async function recordVisit(ref: string, visitor: string, token: string | null) {
  try {
    await request<unknown>("/api/challenge/visits", { method: "POST", token, body: { ref, visitor }, timeoutMs: 8000 });
  } catch {
    // Es solo una métrica.
  }
}
export const finishGame = (token: string, gameId: string, taps: number[], untrusted: number) =>
  request<FinishResponse>(`/api/challenge/games/${encodeURIComponent(gameId)}/finish`, { method: "POST", token, body: { taps, untrusted } });

/* ---------- Guardado local (puede fallar: modo privado, almacenamiento bloqueado) ---------- */

const TOKEN_KEY = "sweetcookies:challenge-token";
const PENDING_KEY = "sweetcookies:challenge-pending";
const FOLLOWED_KEY = "sweetcookies:challenge-followed";
const REF_KEY = "sweetcookies:challenge-ref";
const VISITOR_KEY = "sweetcookies:challenge-visitor";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la sesión dura lo que dure la pestaña.
  }
}

export const loadToken = () => read(TOKEN_KEY);
export const saveToken = (token: string | null) => write(TOKEN_KEY, token);

/** Paso "Seguir en Instagram" ya hecho en este navegador (no se verifica). */
export const loadFollowed = () => read(FOLLOWED_KEY) === "1";
export const saveFollowed = () => write(FOLLOWED_KEY, "1");

/** Código del enlace por el que llegó este navegador (se manda al registrarse). */
export const loadRef = () => {
  const ref = read(REF_KEY);
  return ref && /^[a-z2-9]{10}$/.test(ref) ? ref : null;
};
export const saveRef = (ref: string | null) => write(REF_KEY, ref);

/** Id aleatorio de este navegador, solo para no contar dos veces la misma visita (no es publicidad ni rastreo entre sitios). */
export function visitorId(): string {
  const saved = read(VISITOR_KEY);
  if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  const id = randomId();
  write(VISITOR_KEY, id);
  return id;
}

/** Id aleatorio (URL-safe) para pedidos y visitantes. */
export function randomId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b & 63]).join("");
}


/** Resultado que todavía no llegó al servidor (se reintenta al volver). */
export type PendingResult = { gameId: string; taps: number[]; untrusted: number; bites: number; cookies: number };

export function loadPending(): PendingResult | null {
  const raw = read(PENDING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingResult;
    return typeof value.gameId === "string" && Array.isArray(value.taps) ? value : null;
  } catch {
    return null;
  }
}

export const savePending = (pending: PendingResult | null) => write(PENDING_KEY, pending ? JSON.stringify(pending) : null);

/**
 * Cierra una partida con reintentos (mala conexión, backend despertando).
 * Errores definitivos (sesión, partida vencida o inexistente) no se reintentan.
 */
export async function finishWithRetry(token: string, pending: PendingResult): Promise<FinishResponse> {
  const waits = [0, 1500, 4000, 8000];
  let lastError: unknown = null;
  for (const wait of waits) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await finishGame(token, pending.gameId, pending.taps, pending.untrusted);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ChallengeApiError && (error.status === 0 || error.status >= 500 || error.status === 429 || error.code === "too_early");
      if (!retryable) throw error;
    }
  }
  throw lastError;
}
