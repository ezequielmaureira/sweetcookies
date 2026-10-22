import { adminRequest } from "@/lib/admin/admin-api";
import type { ChallengeStatus } from "@/lib/challenge/challenge-api";

/** Cliente del panel para el Sweet Click Challenge (token de Clerk; autoriza el backend). */

export type AdminEdition = {
  id: string;
  number: number;
  isTest: boolean;
  weekStart: string;
  startsAt: string;
  endsAt: string;
  reviewEndsAt: string;
  status: ChallengeStatus;
  storedStatus: ChallengeStatus;
  attempts: number;
  prize: string;
  pausedAt: string | null;
  pauseReason: string | null;
  winnerParticipantId: string | null;
  winnerGameId: string | null;
  winnerScore: number | null;
  resultsPublishedAt: string | null;
};

/** Edición vigente + configuración del servidor (modo y HMAC de IP). */
export type CurrentEdition = AdminEdition & { mode: "test" | "official"; ipTracking: boolean };

export type Suspicion = "NONE" | "LOW" | "HIGH";
export type Review = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export type AdminRankingRow = {
  position: number;
  participantId: string;
  instagram: string;
  score: number;
  cookies: number;
  achievedAt: string;
  gameId: string;
  games: number;
  suspicion: Suspicion;
  review: Review;
  flags: string[];
};

export type AdminGame = {
  id: string;
  participantId: string;
  instagram: string;
  attemptNumber: number;
  ipHash: string | null;
  status: "STARTED" | "FINISHED" | "EXPIRED";
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  tapsReceived: number | null;
  tapsIgnored: number | null;
  untrustedTaps: number | null;
  taps: number[];
  flags: string[];
  suspicion: Suspicion;
  review: Review;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewReason: string | null;
};

export type ClaimStatus = "PENDING" | "CLAIMED" | "CONTACTED" | "DELIVERED";

export type AdminClaim = {
  editionId: string;
  participantId: string;
  gameId: string;
  status: ClaimStatus;
  name: string | null;
  phone: string | null;
  claimedAt: string | null;
  contactedAt: string | null;
  deliveredAt: string | null;
};

export type DuplicateAlert = { ipHash: string; participants: { id: string; instagram: string }[] };

export type EditionDetail = {
  edition: AdminEdition;
  stats: { participants: number; games: number; finished: number; pendingReview: number };
  ranking: AdminRankingRow[];
  alerts: DuplicateAlert[];
  claim: AdminClaim | null;
  disqualifications: { participantId: string; instagram: string; reason: string; createdBy: string; createdAt: string }[];
  actions: { id: string; action: string; reason: string | null; adminUserId: string; participantId: string | null; gameId: string | null; createdAt: string }[];
};

export type AdminParticipant = {
  id: string;
  instagram: string;
  ipHash: string | null;
  duplicateAttempts: number;
  lastDuplicateAt: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  /** Intentos usados y mejor puntaje en la edición consultada. */
  attemptsUsed: number;
  best: number | null;
  recoveryPending: boolean;
};

export const FLAG_LABELS: Record<string, string> = {
  TOO_REGULAR: "Ritmo demasiado regular",
  SAME_SPOT: "Mismo punto exacto",
  UNTRUSTED_EVENTS: "Eventos de script",
  EXCEPTIONAL_SCORE: "Puntaje excepcional",
  MANY_IGNORED: "Muchos toques sobre el límite",
};

export const ACTION_LABELS: Record<string, string> = {
  PAUSE: "Pausó la edición",
  RESUME: "Reanudó la edición",
  APPROVE_GAME: "Aprobó una partida",
  REJECT_GAME: "Rechazó una partida",
  DISQUALIFY: "Descalificó",
  REINSTATE: "Rehabilitó",
  PUBLISH_RESULTS: "Confirmó y publicó el ganador",
  CLAIM_CONTACTED: "Marcó el premio como contactado",
  CLAIM_DELIVERED: "Marcó el premio como entregado",
};

export const CLAIM_LABELS: Record<ClaimStatus, string> = {
  PENDING: "Pendiente (el ganador todavía no dejó sus datos)",
  CLAIMED: "Reclamado",
  CONTACTED: "Contactado",
  DELIVERED: "Entregado",
};

/** Conexión (HMAC de IP) abreviada: sirve para comparar, no revela la IP. */
export const connectionLabel = (ipHash: string | null) => (ipHash ? ipHash.slice(0, 6).toUpperCase() : "—");

export const STATUS_LABELS: Record<ChallengeStatus, string> = {
  SCHEDULED: "Programado",
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  FINISHED: "Finalizado",
  RESULTS_PUBLISHED: "Resultados publicados",
};

const post = <T>(token: string | null, path: string, body: unknown) => adminRequest<T>(path, token, { method: "POST", body: JSON.stringify(body) });

export const getCurrentEdition = (token: string | null) => adminRequest<CurrentEdition>("/api/admin/challenge/current", token);
export const listEditions = async (token: string | null) => (await adminRequest<{ editions: AdminEdition[] }>("/api/admin/challenge/editions", token)).editions;
export const getEdition = (token: string | null, id: string) => adminRequest<EditionDetail>(`/api/admin/challenge/editions/${encodeURIComponent(id)}`, token);
export const listGames = async (token: string | null, id: string, filter: "all" | "suspicious") =>
  (await adminRequest<{ games: AdminGame[] }>(`/api/admin/challenge/editions/${encodeURIComponent(id)}/games?filter=${filter}`, token)).games;
export const listParticipants = async (token: string | null, id: string) =>
  (await adminRequest<{ participants: AdminParticipant[] }>(`/api/admin/challenge/editions/${encodeURIComponent(id)}/participants`, token)).participants;

export const pauseEdition = (token: string | null, id: string, reason: string) => post<AdminEdition>(token, `/api/admin/challenge/editions/${encodeURIComponent(id)}/pause`, { reason });
export const resumeEdition = (token: string | null, id: string, reason: string) => post<AdminEdition>(token, `/api/admin/challenge/editions/${encodeURIComponent(id)}/resume`, { reason });
export const publishResults = (token: string | null, id: string, reason: string) => post<AdminEdition>(token, `/api/admin/challenge/editions/${encodeURIComponent(id)}/publish`, { reason });
export const reviewGame = (token: string | null, gameId: string, decision: "APPROVED" | "REJECTED", reason: string) =>
  post<unknown>(token, `/api/admin/challenge/games/${encodeURIComponent(gameId)}/review`, { decision, reason });
export const disqualify = (token: string | null, id: string, participantId: string, reason: string) =>
  post<unknown>(token, `/api/admin/challenge/editions/${encodeURIComponent(id)}/disqualify`, { participantId, reason });
export const reinstate = (token: string | null, id: string, participantId: string, reason: string) =>
  post<unknown>(token, `/api/admin/challenge/editions/${encodeURIComponent(id)}/reinstate`, { participantId, reason });

export const setClaimStatus = (token: string | null, id: string, status: "CONTACTED" | "DELIVERED", reason: string) =>
  post<unknown>(token, `/api/admin/challenge/editions/${encodeURIComponent(id)}/claim`, { status, reason });
export const createRecoveryCode = (token: string | null, participantId: string) =>
  post<{ code: string; handle: string; expiresAt: string }>(token, `/api/admin/challenge/participants/${encodeURIComponent(participantId)}/recovery`, {});

/** Resumen del ritmo de una partida para revisarla: intervalo medio y regularidad. */
export function rhythm(taps: number[]): { count: number; meanGap: number | null; variation: number | null } {
  const times: number[] = [];
  for (let i = 0; i < taps.length; i += 3) times.push(taps[i]);
  if (times.length < 3) return { count: times.length, meanGap: null, variation: null };
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  return { count: times.length, meanGap: Math.round(mean), variation: mean > 0 ? Math.round((sd / mean) * 100) : null };
}
