import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";
import {
  DuplicateParticipantError,
  GAME_DURATION_MS,
  MAX_VISITS_PER_CONNECTION,
  generateInviteCode,
  TERMS_VERSION,
  overlaps,
  type AdminRankingRow,
  type ChallengeRepository,
  type ClaimRecord,
  type DuplicateAlert,
  type GameRecord,
  type RankingRow,
  type SaveResult,
  type TournamentInput,
} from "./challenge.ts";
import { PUBLISHED_STATUSES } from "./challenge-time.ts";

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const participantSelect = {
  id: true,
  instagram: true,
  ipHash: true,
  duplicateAttempts: true,
  lastDuplicateAt: true,
  createdAt: true,
  fullName: true,
  phone: true,
  contactUpdatedAt: true,
} as const;

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
  clientRequestId: true,
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
  edition: { select: { number: true, name: true, prize: true, prizeDescription: true, prizeImageUrl: true, isTest: true } },
  participant: { select: { instagram: true, fullName: true, phone: true, contactUpdatedAt: true } },
} as const;

type ClaimRow = Prisma.ChallengePrizeClaimGetPayload<{ select: typeof claimSelect }>;

const toClaim = ({ edition, participant, ...claim }: ClaimRow): ClaimRecord => ({
  ...claim,
  editionNumber: edition.number,
  editionName: edition.name,
  prize: edition.prize,
  prizeDescription: edition.prizeDescription,
  prizeImageUrl: edition.prizeImageUrl,
  isTest: edition.isTest,
  instagram: participant.instagram,
  current: { name: participant.fullName, phone: participant.phone, updatedAt: participant.contactUpdatedAt },
});

/** Publicado = visible para los jugadores (no borrador, despublicado, cancelado ni eliminado). */
const published = { status: { in: [...PUBLISHED_STATUSES] }, deletedAt: null };
/** Torneos reales publicados (los históricos de prueba nunca bloquean ni tienen prioridad). */
const realPublished = { ...published, isTest: false };

/** Clave del bloqueo de Postgres que serializa altas/ediciones de torneos (evita superposiciones simultáneas). */
const TOURNAMENT_LOCK = 20261023;

const tournamentData = (data: TournamentInput) => ({
  name: data.name,
  description: data.description,
  startsAt: data.startsAt,
  endsAt: data.endsAt,
  prize: data.prize,
  prizeDescription: data.prizeDescription,
  prizeImageUrl: data.prizeImageUrl,
  attempts: data.attempts,
  isTest: data.isTest,
});

type BestRow = { participant_id: string; instagram: string; score: number; finished_at: Date; game_id: string };

export function createChallengeRepository(prisma: PrismaClient): ChallengeRepository {
  /**
   * Mejor partida de cada participante: puntaje más alto y, a igual puntaje, la
   * que se logró primero (hora del servidor). Excluye partidas rechazadas y
   * participantes descalificados en el torneo.
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

  /**
   * Dentro de una transacción con bloqueo: otro torneo real PUBLICADO que se
   * superponga con estas fechas (null = libre). Borradores, despublicados,
   * cancelados, eliminados e históricos de prueba nunca bloquean.
   */
  const conflictFor = async (tx: Prisma.TransactionClient, range: { startsAt: Date; endsAt: Date }, excludeId: string | null) => {
    const others = await tx.challengeEdition.findMany({
      where: { ...realPublished, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] }, ...(excludeId ? { id: { not: excludeId } } : {}), startsAt: { lt: range.endsAt }, endsAt: { gt: range.startsAt } },
      select: { id: true, name: true, startsAt: true, endsAt: true },
      take: 1,
    });
    return others.find((o) => overlaps(o, range)) ?? null;
  };

  const lock = (tx: Prisma.TransactionClient) => tx.$executeRaw`SELECT pg_advisory_xact_lock(${TOURNAMENT_LOCK})`;

  const nextNumber = async (tx: Prisma.TransactionClient, isTest: boolean) =>
    ((await tx.challengeEdition.aggregate({ where: { isTest }, _max: { number: true } }))._max.number ?? 0) + 1;

  return {
    async publicTournaments(now) {
      const [live, lastEnded, next, legacy] = await Promise.all([
        prisma.challengeEdition.findFirst({ where: { ...realPublished, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] }, startsAt: { lte: now }, endsAt: { gte: now } }, orderBy: { startsAt: "desc" } }),
        prisma.challengeEdition.findFirst({
          where: { ...realPublished, OR: [{ endsAt: { lt: now } }, { status: { in: ["FINISHED", "RESULTS_PUBLISHED"] } }] },
          orderBy: { endsAt: "desc" },
        }),
        prisma.challengeEdition.findFirst({ where: { ...realPublished, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] }, startsAt: { gt: now } }, orderBy: { startsAt: "asc" } }),
        // Histórico de prueba: solo se muestra si no hay ningún torneo real que mostrar.
        prisma.challengeEdition.findFirst({ where: { ...published, isTest: true }, orderBy: { startsAt: "desc" } }),
      ]);
      return { live, lastEnded, next, legacy };
    },

    getEdition: (id) => prisma.challengeEdition.findUnique({ where: { id } }),

    async listEditions() {
      const [rows, counts] = await Promise.all([
        prisma.challengeEdition.findMany({ orderBy: [{ startsAt: "desc" }], take: 200 }),
        prisma.$queryRaw<{ edition_id: string; participants: bigint; games: bigint }[]>`
          SELECT edition_id, COUNT(DISTINCT participant_id) AS participants, COUNT(*) AS games
          FROM challenge_games GROUP BY edition_id`,
      ]);
      return rows.map((edition) => {
        const count = counts.find((c) => c.edition_id === edition.id);
        return { ...edition, participants: Number(count?.participants ?? 0), games: Number(count?.games ?? 0) };
      });
    },

    async createEdition(data, adminUserId): Promise<SaveResult> {
      return prisma.$transaction(async (tx) => {
        await lock(tx);
        // Crear nunca publica: el torneo nace en borrador.
        const edition = await tx.challengeEdition.create({
          data: { ...tournamentData(data), isTest: false, status: "DRAFT", number: await nextNumber(tx, false), gameDurationMs: GAME_DURATION_MS, createdBy: adminUserId },
        });
        await log(tx, { editionId: edition.id, action: "CREATE_DRAFT", reason: null, adminUserId });
        return { ok: true, edition };
      });
    },

    async updateEdition(id, data, changes, reason, adminUserId): Promise<SaveResult> {
      return prisma.$transaction(async (tx) => {
        await lock(tx);
        const current = await tx.challengeEdition.findUnique({ where: { id } });
        if (!current) return { ok: false, conflict: null };
        // Solo un torneo publicado ocupa fechas.
        if (["SCHEDULED", "ACTIVE", "PAUSED"].includes(current.status)) {
          const conflict = await conflictFor(tx, data, id);
          if (conflict) return { ok: false, conflict: { id: conflict.id, name: conflict.name } };
        }
        // El tipo (real / histórico) nunca cambia al editar.
        const edition = await tx.challengeEdition.update({ where: { id }, data: { ...tournamentData(data), isTest: current.isTest } });
        const detail = `Cambios: ${changes.join(", ") || "ninguno"}${reason ? ` · ${reason}` : ""}`;
        await log(tx, { editionId: id, action: changes.includes("prize") || changes.includes("prizeDescription") ? "UPDATE_PRIZE" : "UPDATE", reason: detail.slice(0, 300), adminUserId });
        return { ok: true, edition };
      });
    },

    async publishEdition(id, adminUserId): Promise<SaveResult> {
      return prisma.$transaction(async (tx) => {
        await lock(tx);
        const current = await tx.challengeEdition.findUnique({ where: { id } });
        if (!current || current.deletedAt || current.isTest || (current.status !== "DRAFT" && current.status !== "UNPUBLISHED")) return { ok: false, conflict: null };
        const conflict = await conflictFor(tx, current, id);
        if (conflict) return { ok: false, conflict: { id: conflict.id, name: conflict.name } };
        const edition = await tx.challengeEdition.update({ where: { id }, data: { status: "SCHEDULED" } });
        await log(tx, { editionId: id, action: current.status === "UNPUBLISHED" ? "REPUBLISH" : "PUBLISH", reason: null, adminUserId });
        return { ok: true, edition };
      });
    },

    async unpublishEdition(id, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.challengeEdition.updateMany({
          where: { id, deletedAt: null, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] } },
          data: { status: "UNPUBLISHED", pausedAt: null, pausedBy: null, pauseReason: null },
        });
        if (count === 0) return null;
        await log(tx, { editionId: id, action: "UNPUBLISH", reason, adminUserId });
        return tx.challengeEdition.findUnique({ where: { id } });
      });
    },

    async finishEdition(id, now, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        const current = await tx.challengeEdition.findUnique({ where: { id } });
        // Solo un torneo publicado que ya empezó (si no empezó, se despublica).
        if (!current || current.deletedAt || !["SCHEDULED", "ACTIVE", "PAUSED"].includes(current.status) || current.startsAt.getTime() >= now.getTime()) return null;
        const endsAt = current.endsAt.getTime() > now.getTime() ? now : current.endsAt;
        const { count } = await tx.challengeEdition.updateMany({
          where: { id, status: current.status },
          data: { status: "FINISHED", endsAt, pausedAt: null, pausedBy: null, pauseReason: null },
        });
        if (count === 0) return null;
        await log(tx, { editionId: id, action: "FINISH", reason, adminUserId });
        return tx.challengeEdition.findUnique({ where: { id } });
      });
    },

    async deletionInfo(id) {
      const edition = await prisma.challengeEdition.findUnique({ where: { id }, select: { id: true, winnerParticipantId: true, status: true } });
      if (!edition) return null;
      const [participants, games, invites, referrals, disqualifications, claim] = await Promise.all([
        prisma.challengeGame.groupBy({ by: ["participantId"], where: { editionId: id } }).then((rows) => rows.length),
        prisma.challengeGame.count({ where: { editionId: id } }),
        prisma.challengeInvite.count({ where: { editionId: id } }),
        prisma.challengeReferral.count({ where: { editionId: id } }),
        prisma.challengeDisqualification.count({ where: { editionId: id } }),
        prisma.challengePrizeClaim.findUnique({ where: { editionId: id }, select: { status: true } }),
      ]);
      const active = games + invites + referrals + disqualifications > 0 || claim !== null || edition.winnerParticipantId !== null;
      return {
        participants,
        games,
        invites,
        referrals,
        winnerPublished: edition.status === "RESULTS_PUBLISHED",
        claimStatus: claim?.status ?? null,
        mode: active ? "soft" : "hard",
      };
    },

    async deleteEdition(id, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        await lock(tx);
        const current = await tx.challengeEdition.findUnique({ where: { id } });
        if (!current || current.deletedAt) return null;
        const [games, invites, referrals, disqualifications, claims] = await Promise.all([
          tx.challengeGame.count({ where: { editionId: id } }),
          tx.challengeInvite.count({ where: { editionId: id } }),
          tx.challengeReferral.count({ where: { editionId: id } }),
          tx.challengeDisqualification.count({ where: { editionId: id } }),
          tx.challengePrizeClaim.count({ where: { editionId: id } }),
        ]);
        if (games + invites + referrals + disqualifications + claims === 0 && !current.winnerParticipantId) {
          // Sin actividad: se borra definitivamente (con su historial de altas y ediciones,
          // que no tiene datos de jugadores). La acción queda en el log del servidor.
          await tx.challengeAdminAction.deleteMany({ where: { editionId: id } });
          await tx.challengeEdition.delete({ where: { id } });
          return { mode: "hard" as const };
        }
        // Con actividad: eliminación lógica. Nada se borra en cascada.
        await tx.challengeEdition.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: adminUserId, deleteReason: reason } });
        await log(tx, { editionId: id, action: "DELETE", reason, adminUserId });
        return { mode: "soft" as const };
      });
    },

    async cancelEdition(id, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        // Se conserva todo el historial (partidas, ranking, participantes); solo deja de estar disponible.
        const { count } = await tx.challengeEdition.updateMany({
          where: { id, deletedAt: null, status: { notIn: ["CANCELLED", "RESULTS_PUBLISHED"] } },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: adminUserId, cancelReason: reason },
        });
        if (count === 0) return null;
        await log(tx, { editionId: id, action: "CANCEL", reason, adminUserId });
        return tx.challengeEdition.findUnique({ where: { id } });
      });
    },

    countPendingWinners: (now) =>
      prisma.challengeEdition.count({
        where: { deletedAt: null, isTest: false, OR: [{ status: "FINISHED" }, { status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] }, endsAt: { lt: now } }] },
      }),

    countGames: (editionId) => prisma.challengeGame.count({ where: { editionId } }),

    async createParticipant({ instagram, contact, tokenHash, ipHash, now }) {
      try {
        return await prisma.challengeParticipant.create({
          data: {
            instagram,
            termsAcceptedAt: now,
            termsVersion: TERMS_VERSION,
            tokenHash,
            tokenIssuedAt: now,
            ipHash,
            lastSeenAt: now,
            fullName: contact.name,
            phone: contact.phone,
            contactUpdatedAt: now,
            contactTermsVersion: TERMS_VERSION,
          },
          select: participantSelect,
        });
      } catch (error) {
        // Índice único del @: nunca dos sesiones (ni dos tandas de intentos) para el mismo usuario.
        if (isUniqueViolation(error)) throw new DuplicateParticipantError();
        throw error;
      }
    },

    async updateContact(participantId, { name, phone }, now) {
      return prisma.$transaction(async (tx) => {
        // Solo el propio participante (lo resuelve la ruta con su token). No toca intentos ni partidas.
        const { count } = await tx.challengeParticipant.updateMany({
          where: { id: participantId },
          data: { fullName: name, phone, contactUpdatedAt: now, contactTermsVersion: TERMS_VERSION, termsAcceptedAt: now, termsVersion: TERMS_VERSION },
        });
        if (count === 0) return null;
        // Ganador anterior que todavía no había dejado sus datos: su premio pendiente los toma (no se le vuelven a pedir).
        await tx.challengePrizeClaim.updateMany({
          where: { participantId, status: "PENDING", edition: { isTest: false, deletedAt: null } },
          data: { status: "CLAIMED", name, phone, claimedAt: now },
        });
        return tx.challengeParticipant.findUnique({ where: { id: participantId }, select: participantSelect });
      });
    },

    async eraseContact(participantId, reason, adminUserId) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.challengeParticipant.updateMany({ where: { id: participantId }, data: { fullName: null, phone: null, contactUpdatedAt: new Date() } });
        if (count === 0) return false;
        // También la copia del premio (si ganó): no queda el teléfono en ninguna tabla.
        await tx.challengePrizeClaim.updateMany({ where: { participantId }, data: { name: null, phone: null } });
        await log(tx, { participantId, action: "CONTACT_ERASED", reason, adminUserId });
        return true;
      });
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
        // El índice único (participante, torneo, intento) frenó una pestaña simultánea.
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },

    findGameByRequest: (participantId, clientRequestId) =>
      prisma.challengeGame.findUnique({ where: { participantId_clientRequestId: { participantId, clientRequestId } }, select: gameSelect }),

    getGame: (id) => prisma.challengeGame.findUnique({ where: { id }, select: gameSelect }),

    async getOrCreateInvite(editionId, participantId, ipHash) {
      const where = { editionId_participantId: { editionId, participantId } };
      const existing = await prisma.challengeInvite.findUnique({ where });
      if (existing) return existing;
      // Código aleatorio; si choca (muy improbable) o dos pestañas lo crean a la vez, se relee o se prueba otro.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await prisma.challengeInvite.create({ data: { editionId, participantId, ipHash, code: generateInviteCode() } });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          const raced = await prisma.challengeInvite.findUnique({ where });
          if (raced) return raced;
        }
      }
      throw new Error("invite_code_collision");
    },

    findInviteByCode: (code) => prisma.challengeInvite.findUnique({ where: { code } }),

    async recordVisit(inviteId, visitorHash, ipHash) {
      if (ipHash && (await prisma.challengeInviteVisit.count({ where: { inviteId, ipHash } })) >= MAX_VISITS_PER_CONNECTION) return false;
      try {
        await prisma.challengeInviteVisit.create({ data: { inviteId, visitorHash, ipHash } });
        return true;
      } catch (error) {
        // Mismo visitante otra vez: no se cuenta de nuevo.
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },

    async recordReferral(data) {
      if (data.referrerId === data.referredId) return false;
      try {
        await prisma.challengeReferral.create({ data });
        return true;
      } catch (error) {
        // Índice único (torneo, referido): nunca se atribuye dos veces.
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },

    async inviteStats(editionId) {
      const [invites, visitRows, referralRows] = await Promise.all([
        prisma.challengeInvite.findMany({ where: { editionId }, select: { id: true, participantId: true, participant: { select: { instagram: true } } } }),
        prisma.challengeInviteVisit.groupBy({ by: ["inviteId"], where: { invite: { editionId } }, _count: { _all: true } }),
        prisma.challengeReferral.groupBy({ by: ["inviteId", "sameConnection"], where: { editionId }, _count: { _all: true } }),
      ]);
      const top = invites
        .map((invite) => {
          const visits = visitRows.find((v) => v.inviteId === invite.id)?._count._all ?? 0;
          const registrations = referralRows.find((r) => r.inviteId === invite.id && !r.sameConnection)?._count._all ?? 0;
          const sameConnection = referralRows.find((r) => r.inviteId === invite.id && r.sameConnection)?._count._all ?? 0;
          return { participantId: invite.participantId, instagram: invite.participant.instagram, visits, registrations, sameConnection };
        })
        .filter((row) => row.visits > 0 || row.registrations > 0 || row.sameConnection > 0)
        .sort((a, b) => b.registrations - a.registrations || b.visits - a.visits)
        .slice(0, 50);
      const sum = (rows: { _count: { _all: number } }[]) => rows.reduce((total, r) => total + r._count._all, 0);
      return {
        invites: invites.length,
        visits: sum(visitRows),
        registrations: sum(referralRows.filter((r) => !r.sameConnection)),
        sameConnection: sum(referralRows.filter((r) => r.sameConnection)),
        top,
      };
    },

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
      const rows = await prisma.challengePrizeClaim.findMany({
        where: { participantId, edition: { isTest: false, deletedAt: null } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: claimSelect,
      });
      return rows.map(toClaim);
    },

    async submitClaim(editionId, participantId, { name, phone }, now) {
      return prisma.$transaction(async (tx) => {
        // Solo el ganador (su participante) y una sola vez: PENDING → CLAIMED.
        const { count } = await tx.challengePrizeClaim.updateMany({
          where: { editionId, participantId, status: "PENDING", edition: { isTest: false, deletedAt: null } },
          data: { status: "CLAIMED", name, phone, claimedAt: now },
        });
        if (count === 0) return null;
        // Ganador anterior sin datos: quedan también en su registro (solo si no tenía), así no se le vuelven a pedir.
        await tx.challengeParticipant.updateMany({
          where: { id: participantId, OR: [{ fullName: null }, { phone: null }] },
          data: { fullName: name, phone, contactUpdatedAt: now, contactTermsVersion: TERMS_VERSION },
        });
        return toClaim(await tx.challengePrizeClaim.findUniqueOrThrow({ where: { editionId }, select: claimSelect }));
      });
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
      const [people, used, bestScores, phones] = await Promise.all([
        prisma.challengeParticipant.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { ...participantSelect, lastSeenAt: true, recoveryExpiresAt: true },
        }),
        prisma.challengeGame.groupBy({ by: ["participantId"], where: { editionId }, _count: { _all: true } }),
        prisma.challengeGame.groupBy({ by: ["participantId"], where: { editionId, status: "FINISHED" }, _max: { score: true } }),
        // WhatsApp repetidos en distintos @ (solo para marcar; el número no sale de acá).
        prisma.challengeParticipant.groupBy({ by: ["phone"], where: { phone: { not: null } }, _count: { _all: true }, having: { phone: { _count: { gt: 1 } } } }),
      ]);
      const now = Date.now();
      const shared = new Set(phones.map((row) => row.phone));
      // El teléfono no se devuelve en el listado: solo si tiene los datos completos.
      return people.map(({ recoveryExpiresAt, phone, ...p }) => ({
        ...p,
        attemptsUsed: used.find((u) => u.participantId === p.id)?._count._all ?? 0,
        best: bestScores.find((b) => b.participantId === p.id)?._max.score ?? null,
        recoveryPending: recoveryExpiresAt !== null && recoveryExpiresAt.getTime() > now,
        hasContact: Boolean(p.fullName && phone),
        sharedPhone: phone !== null && shared.has(phone),
      }));
    },

    async duplicateAlerts(editionId) {
      // Conexiones (HMAC de IP) usadas por más de un @ en el torneo: al registrarse o al jugar.
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
        // Solo se pausa un torneo publicado (en curso), y solo se reanuda uno pausado.
        const { count } = await tx.challengeEdition.updateMany({
          where: { id: editionId, deletedAt: null, status: paused ? { in: ["SCHEDULED", "ACTIVE"] } : "PAUSED" },
          data: paused
            ? { status: "PAUSED", pausedAt: new Date(), pausedBy: adminUserId, pauseReason: reason }
            : { status: "SCHEDULED", pausedAt: null, pausedBy: null, pauseReason: null },
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
          where: { id: editionId, deletedAt: null, isTest: false, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED", "FINISHED"] } },
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
        // Premio atado al participante (su token), no solo al @. Si ya dejó nombre y WhatsApp al
        // registrarse, se copian (no se le vuelven a pedir) y el admin puede contactarlo enseguida.
        if (winner) {
          const person = await tx.challengeParticipant.findUnique({ where: { id: winner.participantId }, select: { fullName: true, phone: true } });
          const ready = Boolean(person?.fullName && person.phone);
          await tx.challengePrizeClaim.create({
            data: {
              editionId,
              participantId: winner.participantId,
              gameId: winner.gameId,
              ...(ready ? { status: "CLAIMED" as const, name: person!.fullName, phone: person!.phone, claimedAt: new Date() } : {}),
            },
          });
        }
        await log(tx, { editionId, participantId: winner?.participantId ?? null, gameId: winner?.gameId ?? null, action: "PUBLISH_RESULTS", reason, adminUserId });
        return tx.challengeEdition.findUnique({ where: { id: editionId } });
      });
    },
  };
}
