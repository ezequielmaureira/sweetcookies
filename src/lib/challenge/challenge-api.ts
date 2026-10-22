/**
 * Cliente del Sweet Click Challenge (navegador).
 *
 * La sesión del participante es un token aleatorio que entrega el servidor al
 * registrarse: se guarda solo en este navegador (localStorage) y se manda como
 * Authorization: Bearer. El servidor guarda únicamente su hash.
 *
 * Para competir se pide solo el @ de Instagram. La práctica no usa el servidor.
 */
import { apiUrl, fetchWithTimeout } from "@/lib/api";

export type ChallengeStatus = "SCHEDULED" | "ACTIVE" | "PAUSED" | "FINISHED" | "RESULTS_PUBLISHED";

export type PublicEdition = {
  id: string;
  number: number;
  /** Edición de prueba privada: sin premio real. */
  isTest: boolean;
  startsAt: string;
  endsAt: string;
  /** Sábado 23:59:59 (fin del día de revisión). */
  reviewEndsAt: string;
  /** Lunes siguiente 00:00: nueva edición con intentos nuevos. */
  nextStartsAt: string;
  status: ChallengeStatus;
  gameDurationMs: number;
  /** Intentos oficiales por torneo semanal. */
  attempts: number;
  bitesPerCookie: number;
  prize: string;
  serverNow: string;
};

export type LeaderRow = { position: number; handle: string; score: number; cookies: number };

export type ChallengeInfo = {
  edition: PublicEdition;
  leaderboard: LeaderRow[];
  ranked: number;
  winner: { handle: string; score: number; cookies: number } | null;
  instagramHandle: string | null;
};

export type Attempts = { limit: number; used: number; left: number };
export type Standing = { position: number; score: number; cookies: number } | null;

export type ClaimStatus = "PENDING" | "CLAIMED" | "CONTACTED" | "DELIVERED";
export type PrizeClaim = { editionId: string; editionNumber: number; isTest: boolean; status: ClaimStatus };

export type Me = {
  participant: { handle: string };
  edition: PublicEdition;
  attempts: Attempts;
  best: Standing;
  ranked: number;
  disqualified: boolean;
  /** Premios del jugador como primer puesto confirmado (sin datos de contacto). */
  claims: PrizeClaim[];
};

export type FinishResponse = {
  result: { score: number; cookies: number; best: Standing; ranked: number; newRecord: boolean; enteredTop10: boolean };
  attempts: Attempts;
  edition: PublicEdition;
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

export const getChallenge = () => request<ChallengeInfo>("/api/public/challenge");
export const getMe = (token: string) => request<Me>("/api/challenge/me", { token });
type SessionResponse = { token: string; participant: { handle: string } };

export const register = (instagram: string, terms: boolean) => request<SessionResponse>("/api/challenge/register", { method: "POST", body: { instagram, terms } });
export const recoverSession = (instagram: string, code: string) => request<SessionResponse>("/api/challenge/recover", { method: "POST", body: { instagram, code } });
export const claimPrize = (token: string, editionId: string, data: { name: string; phone: string }) =>
  request<{ claim: PrizeClaim }>(`/api/challenge/claims/${encodeURIComponent(editionId)}`, { method: "POST", token, body: data });
export const startGame = (token: string) =>
  request<{ game: { id: string; durationMs: number; attemptNumber: number }; attempts: Attempts }>("/api/challenge/games", { method: "POST", token });
export const finishGame = (token: string, gameId: string, taps: number[], untrusted: number) =>
  request<FinishResponse>(`/api/challenge/games/${encodeURIComponent(gameId)}/finish`, { method: "POST", token, body: { taps, untrusted } });

/* ---------- Guardado local (puede fallar: modo privado, almacenamiento bloqueado) ---------- */

const TOKEN_KEY = "sweetcookies:challenge-token";
const PENDING_KEY = "sweetcookies:challenge-pending";
const FOLLOWED_KEY = "sweetcookies:challenge-followed";

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
