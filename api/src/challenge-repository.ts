import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";
import {
  ATTEMPTS_PER_EDITION,
  DuplicateParticipantError,
  GAME_DURATION_MS,
  PRIZE,
  TERMS_VERSION,
  type AdminRankingRow,
  type ChallengeRepository,
  type ClaimRecord,
  type DuplicateAlert,
  type GameRecord,
  type RankingRow,
} from "./challenge.ts";

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const participantSelect = { id: true, instagram: true, ipHash: true, duplicateAttempts: true, lastDuplicateAt: true, createdAt: true } as const;

/** Columnas de la partida sin los toques (pesan; solo se leen para revisar). */
const gameSelect = {
  id: true,
  editionId: true,
  participantId: true,
  attemptNumber: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  ipHash: true,
  score: true,
  cookies: true,
  tapsReceived: true,
  tapsIgnored: true,
  untrustedTaps: true,
  flags: true,
  suspicion: true,
  review: true,
  reviewedAt: true,
  reviewedBy: true,
  reviewReason: true,
} as const;

const claimSelect = {
  editionId: true,
  participantId: true,
  gameId: true,
  status: true,
  name: true,
  phone: true,
  claimedAt: true,
  contactedAt: true,
  deliveredAt: true,
  edition: { select: { number: true, isTest: true } },
} as const;

type ClaimRow = Prisma.ChallengePrizeClaimGetPayload<{ select: typeof claimSelect }>;

const toClaim = ({ edition, ...claim }: ClaimRow): ClaimRecord => ({ ...claim, editionNumber: edition.number, isTest: edition.isTest });

type BestRow = { participant_id: string; instagram: string; score: number; finished_at: Date; game_id: string };

export function createChallengeRepository(prisma: PrismaClient): ChallengeRepository {
  /**
   * Mejor partida de cada participante: puntaje más alto y, a igual puntaje, la
   * que se logró primero (hora del servidor). Excluye partidas rechazadas y
   * participantes descalificados en la edición.
   */
  const best = (editionId: string) => prisma.$queryRaw<BestRow[]>`
    SELECT b.participant_id, p.instagram, b.score, b.finished_at, b.game_id
    FROM (
      SELECT DISTINCT ON (g.participant_id) g.participant_id, g.score, g.finished_at, g.id AS game_id
      FROM challenge_games g
      WHERE g.edition_id = ${editionId}
        AND g.status = 'FINISHED'
        AND g.review <> 'REJECTED'
        AND NOT EXISTS (
          SELECT 1 FROM challenge_disqualifications d
          WHERE d.edition_id = g.edition_id AND d.participant_id = g.participant_id
        )
      ORDER BY g.participant_id, g.score DESC, g.finished_at ASC, g.id ASC
    ) b
    JOIN challenge_participants p ON p.id = b.participant_id
    ORDER BY b.score DESC, b.finished_at ASC, b.game_id ASC`;

  const toRanking = (rows: BestRow[]): RankingRow[] =>
    rows.map((r) => ({ participantId: r.participant_id, instagram: r.instagram, score: Number(r.score), achievedAt: r.finished_at, gameId: r.game_id }));

  const log = (tx: Prisma.TransactionClient, data: { editionId?: string | null; participantId?: string | null; gameId?: string | null; action: string; reason: string | null; adminUserId: string }) =>
    tx.challengeAdminAction.create({ data });

  return {
    async ensureEdition({ isTest, ...window }) {
      const where = { weekStart_isTest: { weekStart: window.weekStart, isTest } };
      const existing = await prisma.challengeEdition.findUnique({ where });
      if (existing) return existing;
      // Numeración propia de prueba y de oficiales. El índice único (semana, tipo)
      // frena una creación simultánea: el que pierde relee la que ganó.
      const last = await prisma.challengeEdition.aggregate({ where: { isTest }, _max: { number: true } });
      try {
        return await prisma.challengeEdition.create({
          data: { ...window, isTest, number: (last._max.number ?? 0) + 1, status: "ACTIVE", gameDurationMs: GAME_DURATION_MS, attempts: ATTEMPTS_PER_EDITION, prize: PRIZE },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return prisma.challengeEdition.findUniqueOrThrow({ where });
      }
    },

    getEdition: (id) => prisma.challengeEdition.findUnique({ where: { id } }),

    listEditions: () => prisma.challengeEdition.findMany({ orderBy: [{ startsAt: "desc" }, { isTest: "asc" }], take: 60 }),

    async createParticipant({ instagram, tokenHash, ipHash, now }) {
      try {
        return await prisma.challengeParticipant.create({
          data: { instagram, termsAcceptedAt: now, termsVersion: TERMS_VERSION, tokenHash, tokenIssuedAt: now, ipHash, lastSeenAt: now },
          select: participantSelect,
        });
      } catch (error) {
        // Índice único del @: nunca dos sesiones (ni dos tandas de intentos) para el mismo usuario.
        if (isUniqueViolation(error)) throw new DuplicateParticipantError();
        throw error;
      }
    },

    async noteDuplicate(instagram, now) {
      await prisma.challengeParticipant.updateMany({ where: { instagram }, data: { duplicateAttempts: { increment: 1 }, lastDuplicateAt: now } });
    },

    async findParticipantByTokenHash(tokenHash, now) {
      const participant = await prisma.challengeParticipant.findUnique({ where: { tokenHash }, select: participantSelect });
      if (participant) await prisma.challengeParticipant.update({ where: { id: participant.id }, data: { lastSeenAt: now } });
      return participant;
    },

    async setRecoveryCode(participantId, codeHash, expiresAt, adminUserId) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.challengeParticipant.updateMany({ where: { id: participantId }, data: { recoveryCodeHash: codeHash, recoveryExpiresAt: expiresAt } });
        if (count === 0) return null;
        await log(tx, { participantId, action: "RECOVERY_CODE", reason: null, adminUserId });
        return tx.challengeParticipant.findUnique({ where: { id: participantId }, select: participantSelect });
      });
    },

    async recover(instagram, codeHash, tokenHash, now) {
      // UPDATE condicional: el código vale una sola vez y solo antes de vencer.
      const { count } = await prisma.challengeParticipant.updateMany({
        where: { instagram, recoveryCodeHash: codeHash, recoveryExpiresAt: { gt: now } },
        data: { tokenHash, tokenIssuedAt: now, recoveryCodeHash: null, recoveryExpiresAt: null, lastSeenAt: now },
      });
      if (count === 0) return null;
      return prisma.challengeParticipant.findUnique({ where: { instagram }, select: participantSelect });
    },

    countAttempts: (participantId, editionId) => prisma.challengeGame.count({ where: { participantId, editionId } }),

    async createGame(data) {
      try {
        return await prisma.challengeGame.create({ data, select: gameSelect });
      } catch (error) {
        // El índice único (participante, edición, intento) frenó una pestaña simultánea.
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },

    getGame: (id) => prisma.challengeGame.findUnique({ where: { id }, select: gameSelect }),

    async finishGame(id, result) {
      const review = result.suspicion === "NONE" ? "NONE" : "PENDING";
      // UPDATE condicional: una partida se cierra una sola vez.
      const { count } = await prisma.challengeGame.updateMany({
        where: { id, status: "STARTED" },
        data: { ...result, status: "FINISHED", review },
      });
      if (count === 0) return null;
      return prisma.challengeGame.findUnique({ where: { id }, select: gameSelect });
    },

    async expireGame(id) {
      await prisma.challengeGame.updateMany({ where: { id, status: "STARTED" }, data: { status: "EXPIRED" } });
    },

    ranking: async (editionId) => toRanking(await best(editionId)),

    async isDisqualified(editionId, participantId) {
      return (await prisma.challengeDisqualification.count({ where: { editionId, participantId } })) > 0;
    },

    async claimsOf(participantId) {
      const rows = await prisma.challengePrizeClaim.findMany({ where: { participantId }, orderBy: { createdAt: "desc" }, take: 5, select: claimSelect });
      return rows.map(toClaim);
    },

    async submitClaim(editionId, participantId, { name, phone }, now) {
      // Solo el ganador (su participante) y una sola vez: PENDING → CLAIMED.
      const { count } = await prisma.challengePrizeClaim.updateMany({
        where: { editionId, participantId, status: "PENDING" },
        data: { status: "CLAIMED", name, phone, claimedAt: now },
      });
      if (count === 0) return null;
      return toClaim(await prisma.challengePrizeClaim.findUniqueOrThrow({ where: { editionId }, select: claimSelect }));
    },

    async getClaim(editionId) {
      const row = await prisma.challengePrizeClaim.findUnique({ where: { editionId }, select: claimSelect });
      return row ? toClaim(row) : null;
    },

    async setClaimStatus(editionId, status, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        // Solo hacia adelante: contactado después de pendiente/reclamado, entregado después de cualquiera.
        const from = status === "CONTACTED" ? (["PENDING", "CLAIMED"] as const) : (["PENDING", "CLAIMED", "CONTACTED"] as const);
        const now = new Date();
        const { count } = await tx.challengePrizeClaim.updateMany({
          where: { editionId, status: { in: [...from] } },
          data: status === "CONTACTED" ? { status, contactedAt: now } : { status, deliveredAt: now },
        });
        if (count === 0) return null;
        const claim = await tx.challengePrizeClaim.findUniqueOrThrow({ where: { editionId }, select: claimSelect });
        await log(tx, { editionId, participantId: claim.participantId, action: status === "CONTACTED" ? "CLAIM_CONTACTED" : "CLAIM_DELIVERED", reason, adminUserId });
        return toClaim(claim);
      });
    },

    async stats(editionId) {
      const [participants, games, finished, pendingReview] = await Promise.all([
        prisma.challengeGame.groupBy({ by: ["participantId"], where: { editionId } }).then((rows) => rows.length),
        prisma.challengeGame.count({ where: { editionId } }),
        prisma.challengeGame.count({ where: { editionId, status: "FINISHED" } }),
        prisma.challengeGame.count({ where: { editionId, review: "PENDING" } }),
      ]);
      return { participants, games, finished, pendingReview };
    },

    async adminRanking(editionId) {
      const rows = toRanking(await best(editionId)).slice(0, 50);
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.participantId);
      const [bestGames, counts] = await Promise.all([
        prisma.challengeGame.findMany({ where: { id: { in: rows.map((r) => r.gameId) } }, select: { id: true, suspicion: true, review: true, flags: true } }),
        prisma.challengeGame.groupBy({ by: ["participantId"], where: { editionId, participantId: { in: ids } }, _count: { _all: true } }),
      ]);
      return rows.map((row): AdminRankingRow => {
        const game = bestGames.find((g) => g.id === row.gameId);
        return {
          ...row,
          suspicion: game?.suspicion ?? "NONE",
          review: game?.review ?? "NONE",
          flags: game?.flags ?? [],
          games: counts.find((c) => c.participantId === row.participantId)?._count._all ?? 0,
        };
      });
    },

    async listGames(editionId, filter) {
      const rows = await prisma.challengeGame.findMany({
        where: { editionId, ...(filter === "suspicious" ? { suspicion: { not: "NONE" } } : {}) },
        orderBy: filter === "suspicious" ? [{ review: "asc" }, { score: "desc" }] : [{ startedAt: "desc" }],
        take: 200,
        select: { ...gameSelect, taps: true, participant: { select: { instagram: true } } },
      });
      return rows.map(({ participant, ...game }) => ({ ...game, instagram: participant.instagram }));
    },

    async listParticipants(editionId) {
      const [people, used, bestScores] = await Promise.all([
        prisma.challengeParticipant.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { ...participantSelect, lastSeenAt: true, recoveryExpiresAt: true },
        }),
        prisma.challengeGame.groupBy({ by: ["participantId"], where: { editionId }, _count: { _all: true } }),
        prisma.challengeGame.groupBy({ by: ["participantId"], where: { editionId, status: "FINISHED" }, _max: { score: true } }),
      ]);
      const now = Date.now();
      return people.map(({ recoveryExpiresAt, ...p }) => ({
        ...p,
        attemptsUsed: used.find((u) => u.participantId === p.id)?._count._all ?? 0,
        best: bestScores.find((b) => b.participantId === p.id)?._max.score ?? null,
        recoveryPending: recoveryExpiresAt !== null && recoveryExpiresAt.getTime() > now,
      }));
    },

    async duplicateAlerts(editionId) {
      // Conexiones (HMAC de IP) usadas por más de un @ en la edición: al registrarse o al jugar.
      const [games, players] = await Promise.all([
        prisma.challengeGame.findMany({ where: { editionId, ipHash: { not: null } }, distinct: ["ipHash", "participantId"], select: { ipHash: true, participantId: true } }),
        prisma.challengeGame.findMany({ where: { editionId }, distinct: ["participantId"], select: { participant: { select: { id: true, instagram: true, ipHash: true } } } }),
      ]);
      const byIp = new Map<string, Set<string>>();
      const add = (ip: string | null, id: string) => {
        if (!ip) return;
        if (!byIp.has(ip)) byIp.set(ip, new Set());
        byIp.get(ip)!.add(id);
      };
      for (const g of games) add(g.ipHash, g.participantId);
      for (const { participant } of players) add(participant.ipHash, participant.id);
      const names = new Map(players.map(({ participant }) => [participant.id, participant.instagram]));
      const alerts: DuplicateAlert[] = [];
      for (const [ipHash, ids] of byIp) {
        if (ids.size < 2) continue;
        alerts.push({ ipHash, participants: [...ids].map((id) => ({ id, instagram: names.get(id) ?? "?" })) });
      }
      return alerts.sort((a, b) => b.participants.length - a.participants.length);
    },

    async listDisqualifications(editionId) {
      const rows = await prisma.challengeDisqualification.findMany({
        where: { editionId },
        orderBy: { createdAt: "desc" },
        select: { participantId: true, reason: true, createdBy: true, createdAt: true, participant: { select: { instagram: true } } },
      });
      return rows.map(({ participant, ...d }) => ({ ...d, instagram: participant.instagram }));
    },

    listActions: (editionId) =>
      prisma.challengeAdminAction.findMany({
        where: { editionId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, action: true, reason: true, adminUserId: true, participantId: true, gameId: true, createdAt: true },
      }),

    async setPaused(editionId, paused, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        // Solo se pausa una edición en juego, y solo se reanuda una pausada.
        const { count } = await tx.challengeEdition.updateMany({
          where: { id: editionId, status: paused ? "ACTIVE" : "PAUSED" },
          data: paused
            ? { status: "PAUSED", pausedAt: new Date(), pausedBy: adminUserId, pauseReason: reason }
            : { status: "ACTIVE", pausedAt: null, pausedBy: null, pauseReason: null },
        });
        if (count === 0) return null;
        await log(tx, { editionId, action: paused ? "PAUSE" : "RESUME", reason, adminUserId });
        return tx.challengeEdition.findUnique({ where: { id: editionId } });
      });
    },

    async reviewGame(gameId, decision, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.challengeGame.updateMany({
          where: { id: gameId, status: "FINISHED" },
          data: { review: decision, reviewedAt: new Date(), reviewedBy: adminUserId, reviewReason: reason },
        });
        if (count === 0) return null;
        const game = await tx.challengeGame.findUniqueOrThrow({ where: { id: gameId }, select: gameSelect });
        await log(tx, { editionId: game.editionId, participantId: game.participantId, gameId, action: decision === "APPROVED" ? "APPROVE_GAME" : "REJECT_GAME", reason, adminUserId });
        return game as GameRecord;
      });
    },

    async disqualify(editionId, participantId, reason, adminUserId) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.challengeDisqualification.create({ data: { editionId, participantId, reason, createdBy: adminUserId } });
          await log(tx, { editionId, participantId, action: "DISQUALIFY", reason, adminUserId });
        });
        return true;
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },

    async reinstate(editionId, participantId, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.challengeDisqualification.deleteMany({ where: { editionId, participantId } });
        if (count === 0) return false;
        await log(tx, { editionId, participantId, action: "REINSTATE", reason, adminUserId });
        return true;
      });
    },

    async publishResults(editionId, winner, adminUserId, reason) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.challengeEdition.updateMany({
          where: { id: editionId, status: { not: "RESULTS_PUBLISHED" } },
          data: {
            status: "RESULTS_PUBLISHED",
            winnerParticipantId: winner?.participantId ?? null,
            winnerGameId: winner?.gameId ?? null,
            winnerScore: winner?.score ?? null,
            resultsPublishedAt: new Date(),
            resultsPublishedBy: adminUserId,
          },
        });
        if (count === 0) return null;
        // Premio pendiente de reclamo, atado al participante (su token), no solo al @.
        if (winner) await tx.challengePrizeClaim.create({ data: { editionId, participantId: winner.participantId, gameId: winner.gameId } });
        await log(tx, { editionId, participantId: winner?.participantId ?? null, gameId: winner?.gameId ?? null, action: "PUBLISH_RESULTS", reason, adminUserId });
        return tx.challengeEdition.findUnique({ where: { id: editionId } });
      });
    },
  };
}
