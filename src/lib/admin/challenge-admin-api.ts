import { AdminApiError, adminRequest } from "@/lib/admin/admin-api";
import { apiUrl, fetchWithTimeout } from "@/lib/api";
import type { ChallengeStatus } from "@/lib/challenge/challenge-api";

/** Cliente del panel para el Sweet Click Challenge (token de Clerk; autoriza el backend). */

/** Torneo visto desde el panel (estado calculado por el servidor). */
export type AdminEdition = {
  id: string;
  number: number;
  name: string;
  description: string | null;
  isTest: boolean;
  startsAt: string;
  endsAt: string;
  /** Fecha y hora en Córdoba, para el formulario. */
  start: { date: string; time: string };
  end: { date: string; time: string };
  status: ChallengeStatus;
  storedStatus: ChallengeStatus;
  /** Visible al público (no es lo mismo que activo). */
  published: boolean;
  /** Torneo histórico de prueba: no se edita, no se reactiva, no tiene premio. */
  legacy: boolean;
  deletedAt: string | null;
  deleteReason: string | null;
  attempts: number;
  prize: string;
  prizeDescription: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  winnerParticipantId: string | null;
  winnerGameId: string | null;
  winnerScore: number | null;
  resultsPublishedAt: string | null;
};

/** Torneo en el listado: con participantes y partidas. */
export type EditionListItem = AdminEdition & { participants: number; games: number };

export type Overview = {
  ipTracking: boolean;
  limits: { minAttempts: number; maxAttempts: number };
  live: AdminEdition | null;
  next: AdminEdition | null;
  liveStats: { participants: number; games: number; finished: number; pendingReview: number } | null;
  liveAlerts: number;
  pendingWinners: number;
  serverNow: string;
};

/** Formulario de torneo (fechas y horas en Córdoba). */
export type TournamentForm = {
  name: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  prize: string;
  prizeDescription: string;
  attempts: number;
};

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
  /** Intentos usados y mejor puntaje en el torneo consultado. */
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
  CREATE_DRAFT: "Creó el torneo como borrador",
  PUBLISH: "Publicó el torneo",
  REPUBLISH: "Volvió a publicar el torneo",
  UNPUBLISH: "Despublicó el torneo",
  FINISH: "Finalizó el torneo",
  DELETE: "Eliminó el torneo",
  CREATE_SCHEDULED: "Creó y programó el torneo",
  SCHEDULE: "Programó el torneo",
  UPDATE: "Editó el torneo",
  UPDATE_PRIZE: "Editó el torneo (cambió el premio)",
  CANCEL: "Canceló el torneo",
  PAUSE: "Pausó el torneo",
  RESUME: "Reanudó el torneo",
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
  DRAFT: "Borrador",
  UNPUBLISHED: "Despublicado",
  SCHEDULED: "Programado",
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  FINISHED: "Finalizado",
  RESULTS_PUBLISHED: "Ganador publicado",
  CANCELLED: "Cancelado",
};

const post = <T>(token: string | null, path: string, body: unknown) => adminRequest<T>(path, token, { method: "POST", body: JSON.stringify(body) });

export const getOverview = (token: string | null) => adminRequest<Overview>("/api/admin/challenge/overview", token);
export const listEditions = async (token: string | null) => (await adminRequest<{ editions: EditionListItem[] }>("/api/admin/challenge/editions", token)).editions;
/**
 * Error de torneo con el código y el mensaje del servidor (superposición,
 * reglas de edición, modo oficial bloqueado). Sigue siendo un AdminApiError.
 */
export class TournamentApiError extends AdminApiError {
  readonly code: string;
  readonly serverMessage: string | null;
  constructor(status: number, body: { error?: string; message?: string; fields?: Record<string, string> }) {
    super(status, body.fields ?? {});
    this.code = body.error ?? "";
    this.serverMessage = body.message ?? null;
  }
}

async function tournamentRequest<T>(path: string, token: string | null, method: "POST" | "PUT" | "DELETE", body: unknown): Promise<T> {
  const url = apiUrl(path);
  if (!url) throw new TournamentApiError(0, {});
  if (!token) throw new TournamentApiError(401, {});
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 30000,
    });
  } catch {
    throw new TournamentApiError(0, {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new TournamentApiError(res.status, data);
  return data as T;
}

const tournamentPath = (id: string) => `/api/admin/challenge/editions/${encodeURIComponent(id)}`;

/** Crear siempre guarda un BORRADOR (no visible). Publicar es otra acción. */
export const createTournament = (token: string | null, form: TournamentForm) => tournamentRequest<AdminEdition>("/api/admin/challenge/editions", token, "POST", form);
export const updateTournament = (token: string | null, id: string, form: TournamentForm, extra: { reason?: string; confirmPrizeChange?: boolean }) =>
  tournamentRequest<AdminEdition>(tournamentPath(id), token, "PUT", { ...form, ...extra });
export const publishTournament = (token: string | null, id: string) => tournamentRequest<AdminEdition>(`${tournamentPath(id)}/publish-tournament`, token, "POST", {});
export const unpublishTournament = (token: string | null, id: string, reason: string) => tournamentRequest<AdminEdition>(`${tournamentPath(id)}/unpublish`, token, "POST", { reason });
export const finishTournament = (token: string | null, id: string, reason: string) => tournamentRequest<AdminEdition>(`${tournamentPath(id)}/finish`, token, "POST", { reason });
export const pauseTournament = (token: string | null, id: string, reason: string) => tournamentRequest<AdminEdition>(`${tournamentPath(id)}/pause`, token, "POST", { reason });
export const resumeTournament = (token: string | null, id: string) => tournamentRequest<AdminEdition>(`${tournamentPath(id)}/resume`, token, "POST", {});

/** Qué tiene un torneo antes de eliminarlo. "hard" = se borra definitivamente; "soft" = eliminación lógica. */
export type DeletionInfo = {
  participants: number;
  games: number;
  invites: number;
  referrals: number;
  winnerPublished: boolean;
  claimStatus: ClaimStatus | null;
  mode: "hard" | "soft";
};
export const getDeletionInfo = (token: string | null, id: string) => adminRequest<DeletionInfo>(`${tournamentPath(id)}/deletion`, token);
export const deleteTournament = (token: string | null, id: string, reason: string) =>
  tournamentRequest<{ ok: true; mode: "hard" | "soft" }>(tournamentPath(id), token, "DELETE", { confirm: "ELIMINAR", reason: reason || undefined });
export const getEdition = (token: string | null, id: string) => adminRequest<EditionDetail>(`/api/admin/challenge/editions/${encodeURIComponent(id)}`, token);
export const listGames = async (token: string | null, id: string, filter: "all" | "suspicious") =>
  (await adminRequest<{ games: AdminGame[] }>(`/api/admin/challenge/editions/${encodeURIComponent(id)}/games?filter=${filter}`, token)).games;
/**
 * Invitaciones de un torneo. "invites" = enlaces generados (no prueba que se
 * hayan enviado); "visits" = visitantes distintos que abrieron un enlace;
 * "registrations" = registros nuevos atribuidos por el servidor (sin los de la
 * misma conexión que quien invitó, que van en "sameConnection").
 */
export type InviteStats = {
  invites: number;
  visits: number;
  registrations: number;
  sameConnection: number;
  /** Registros / visitas, en %. null si todavía no hay visitas. */
  conversion: number | null;
  top: { instagram: string; visits: number; registrations: number; sameConnection: number }[];
};

export const getInviteStats = (token: string | null, id: string) => adminRequest<InviteStats>(`/api/admin/challenge/editions/${encodeURIComponent(id)}/invites`, token);

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
