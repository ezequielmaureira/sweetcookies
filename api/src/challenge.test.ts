import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import {
  DuplicateParticipantError,
  GAME_DURATION_MS,
  MAX_VISITS_PER_CONNECTION,
  assessGame,
  checkTournamentEdit,
  finishDeadline,
  hashIp,
  normalizeArgentinePhone,
  normalizeInstagram,
  overlaps,
  parseFinishInput,
  scoreTaps,
  validateJoin,
  validateTournament,
  type ChallengeRepository,
  type ClaimRecord,
  type EditionRecord,
  type GameRecord,
  type InviteRecord,
  type ParticipantRecord,
  type RankingRow,
  type SaveResult,
  type Tap,
} from "./challenge.ts";
import { registerChallengeRoutes } from "./challenge-routes.ts";
import { PUBLISHED_STATUSES, cordobaDateTime, effectiveStatus, parseCordobaDateTime } from "./challenge-time.ts";
import type { SettingsRepository } from "./repository.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de respuesta en tests
const json = async (res: Response): Promise<Record<string, any>> => (await res.json()) as Record<string, any>;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ---------- Fechas y estados ---------- */

describe("fechas de torneo (America/Argentina/Cordoba)", () => {
  it("la fecha y hora del admin se leen en Córdoba; el cierre dura hasta el final del minuto", () => {
    assert.equal(parseCordobaDateTime("2026-10-30", "18:00")?.toISOString(), "2026-10-30T21:00:00.000Z");
    assert.equal(parseCordobaDateTime("2026-10-31", "23:59", true)?.toISOString(), "2026-11-01T02:59:59.999Z");
    assert.deepEqual(cordobaDateTime(new Date("2026-10-30T21:00:00Z")), { date: "2026-10-30", time: "18:00" });
  });

  it("rechaza fechas y horas inexistentes", () => {
    assert.equal(parseCordobaDateTime("2026-02-31", "10:00"), null);
    assert.equal(parseCordobaDateTime("2026-10-30", "24:00"), null);
    assert.equal(parseCordobaDateTime("30/10/2026", "18:00"), null);
  });

  it("estado real: se activa y finaliza solo según sus fechas; borrador, cancelado y ganador los decide el admin", () => {
    const t = { startsAt: new Date("2026-10-30T21:00:00Z"), endsAt: new Date("2026-11-01T02:59:59.999Z") };
    const at = (iso: string) => new Date(iso);
    assert.equal(effectiveStatus({ ...t, status: "SCHEDULED" }, at("2026-10-30T20:59:59Z")), "SCHEDULED");
    assert.equal(effectiveStatus({ ...t, status: "SCHEDULED" }, at("2026-10-30T21:00:00Z")), "ACTIVE");
    assert.equal(effectiveStatus({ ...t, status: "SCHEDULED" }, at("2026-11-01T03:00:00Z")), "FINISHED");
    assert.equal(effectiveStatus({ ...t, status: "PAUSED" }, at("2026-10-31T12:00:00Z")), "PAUSED");
    assert.equal(effectiveStatus({ ...t, status: "DRAFT" }, at("2026-10-31T12:00:00Z")), "DRAFT");
    assert.equal(effectiveStatus({ ...t, status: "CANCELLED" }, at("2026-10-31T12:00:00Z")), "CANCELLED");
    assert.equal(effectiveStatus({ ...t, status: "RESULTS_PUBLISHED" }, at("2026-11-02T12:00:00Z")), "RESULTS_PUBLISHED");
    // Torneos creados antes de este cambio (estado guardado ACTIVE) siguen funcionando igual.
    assert.equal(effectiveStatus({ ...t, status: "ACTIVE" }, at("2026-10-31T12:00:00Z")), "ACTIVE");
    assert.equal(effectiveStatus({ ...t, status: "ACTIVE" }, at("2026-11-01T03:00:00Z")), "FINISHED");
  });

  it("partida empezada antes del cierre: se acepta su cierre solo con un margen técnico acotado", () => {
    const endsAt = new Date("2026-10-31T23:59:59.999Z");
    const lateStart = new Date(endsAt.getTime() - 5_000); // empezó 5 s antes del cierre
    assert.equal(finishDeadline(lateStart, GAME_DURATION_MS, endsAt), lateStart.getTime() + GAME_DURATION_MS + 2 * MIN);
    const early = new Date("2026-10-31T12:00:00Z"); // lejos del cierre: margen normal por mala conexión
    assert.equal(finishDeadline(early, GAME_DURATION_MS, endsAt), early.getTime() + GAME_DURATION_MS + 10 * MIN);
  });
});

/* ---------- Validación y reglas de edición ---------- */

const form = (over: Record<string, unknown> = {}) => ({
  name: "Desafío Halloween",
  description: "Comé la mayor cantidad de cookies.",
  startDate: "2026-10-30",
  startTime: "18:00",
  endDate: "2026-10-31",
  endTime: "23:59",
  prize: "Caja de 6 cookies",
  prizeDescription: "Surtidas, para retirar en Río Cuarto.",
  attempts: 5,
  mode: "official",
  ...over,
});

describe("torneos: validación del formulario", () => {
  it("acepta el ejemplo Desafío Halloween", () => {
    const r = validateTournament(form());
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.data.attempts, 5);
      assert.equal(r.data.isTest, false);
      assert.equal(r.data.prize, "Caja de 6 cookies");
      assert.equal(r.data.startsAt.toISOString(), "2026-10-30T21:00:00.000Z");
    }
  });

  it("rechaza fin anterior al inicio, campos vacíos e intentos inválidos", () => {
    const bad = validateTournament(form({ endDate: "2026-10-30", endTime: "17:00", name: "", prize: "", attempts: 0 }));
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.ok(bad.errors.end && bad.errors.name && bad.errors.prize && bad.errors.attempts);
    for (const attempts of [0, 21, 2.5, "3", null]) assert.equal(validateTournament(form({ attempts })).ok, false, String(attempts));
    assert.equal(validateTournament(form({ endDate: "2026-10-30", endTime: "18:05" })).ok, false); // menos de 15 min
    assert.equal(validateTournament(form({ mode: "otro" })).ok, false);
  });

  it("acepta torneos de distinta duración: horas, un día, quince días", () => {
    assert.ok(validateTournament(form({ endDate: "2026-10-30", endTime: "20:00" })).ok);
    assert.ok(validateTournament(form({ endDate: "2026-10-31", endTime: "18:00" })).ok);
    assert.ok(validateTournament(form({ endDate: "2026-11-14", endTime: "18:00" })).ok);
    assert.equal(validateTournament(form({ endDate: "2027-03-01", endTime: "18:00" })).ok, false); // más de 90 días
  });

  it("superposición de fechas", () => {
    const a = { startsAt: new Date(0), endsAt: new Date(10) };
    assert.equal(overlaps(a, { startsAt: new Date(10), endsAt: new Date(20) }), false);
    assert.equal(overlaps(a, { startsAt: new Date(9), endsAt: new Date(20) }), true);
  });
});

function edition(over: Partial<EditionRecord> = {}): EditionRecord {
  return {
    id: "e1",
    isTest: false,
    number: 1,
    name: "Desafío Halloween",
    description: null,
    weekStart: null,
    startsAt: new Date("2026-10-30T21:00:00Z"),
    endsAt: new Date("2026-11-01T02:59:59.999Z"),
    status: "SCHEDULED",
    gameDurationMs: GAME_DURATION_MS,
    attempts: 5,
    prize: "Caja de 6 cookies",
    prizeDescription: "Surtidas, para retirar en Río Cuarto.",
    cancelledAt: null,
    cancelReason: null,
    pausedAt: null,
    pauseReason: null,
    winnerParticipantId: null,
    winnerGameId: null,
    winnerScore: null,
    resultsPublishedAt: null,
    ...over,
  };
}

describe("torneos: reglas de edición", () => {
  const input = (over: Record<string, unknown> = {}) => {
    const r = validateTournament(form({ description: "", ...over }));
    assert.ok(r.ok);
    return r.data;
  };
  const before = new Date("2026-10-29T12:00:00Z");
  const during = new Date("2026-10-31T12:00:00Z");

  it("antes del inicio y sin partidas se puede cambiar todo (menos el modo fuera de borrador)", () => {
    const r = checkTournamentEdit(edition(), "SCHEDULED", input({ attempts: 2, startTime: "20:00", prize: "Combo" }), { games: 0, reason: null, confirmPrizeChange: false, now: before });
    assert.ok(r.ok);
    assert.equal(checkTournamentEdit(edition(), "SCHEDULED", input({ mode: "test" }), { games: 0, reason: null, confirmPrizeChange: false, now: before }).ok, false);
    assert.ok(checkTournamentEdit(edition({ status: "DRAFT" }), "DRAFT", input({ mode: "test" }), { games: 0, reason: null, confirmPrizeChange: false, now: before }).ok);
  });

  it("ya empezado: inicio fijo, cierre solo se extiende, intentos solo suben, premio con confirmación y motivo", () => {
    const ctx = { games: 4, reason: "Pedido de los jugadores", confirmPrizeChange: false, now: during };
    const e = edition();
    assert.equal((checkTournamentEdit(e, "ACTIVE", input({ startTime: "19:00" }), ctx) as { error: string }).error, "start_locked");
    assert.equal((checkTournamentEdit(e, "ACTIVE", input({ endTime: "22:00" }), ctx) as { error: string }).error, "end_shortened");
    assert.equal((checkTournamentEdit(e, "ACTIVE", input({ attempts: 4 }), ctx) as { error: string }).error, "attempts_reduced");
    assert.equal((checkTournamentEdit(e, "ACTIVE", input({ prize: "Combo especial" }), ctx) as { error: string }).error, "prize_change_unconfirmed");
    assert.equal((checkTournamentEdit(e, "ACTIVE", input({ attempts: 6 }), { ...ctx, reason: null }) as { error: string }).error, "reason_required");
    const ok = checkTournamentEdit(e, "ACTIVE", input({ attempts: 6, endDate: "2026-11-02", prize: "Combo especial" }), { ...ctx, confirmPrizeChange: true });
    assert.ok(ok.ok && ok.changes.includes("attempts") && ok.changes.includes("endsAt") && ok.changes.includes("prize"));
  });

  it("con partidas cuenta como empezado aunque la fecha no haya llegado; terminado o cancelado no se edita", () => {
    assert.equal(checkTournamentEdit(edition(), "SCHEDULED", input({ attempts: 2 }), { games: 1, reason: "x", confirmPrizeChange: false, now: before }).ok, false);
    for (const status of ["FINISHED", "RESULTS_PUBLISHED", "CANCELLED"] as const) {
      assert.equal(checkTournamentEdit(edition(), status, input(), { games: 0, reason: "x", confirmPrizeChange: true, now: during }).ok, false, status);
    }
  });
});

/* ---------- Datos ---------- */

describe("normalización de datos", () => {
  it("Instagram sin @, URL ni mayúsculas", () => {
    assert.equal(normalizeInstagram("@Cookie.Fan"), "cookie.fan");
    assert.equal(normalizeInstagram("https://www.instagram.com/cookie_fan/?hl=es"), "cookie_fan");
    assert.equal(normalizeInstagram("con espacio"), null);
  });

  it("para competir se pide solo el @ y aceptar las bases", () => {
    assert.equal(validateJoin({ instagram: "@ana" }).ok, false);
    const ok = validateJoin({ instagram: "@Ana", terms: true });
    assert.ok(ok.ok && ok.instagram === "ana");
  });

  it("celular del ganador en cualquier formato habitual", () => {
    for (const raw of ["358 412-3456", "0358 15 412-3456", "+54 9 358 412 3456", "5493584123456"]) assert.equal(normalizeArgentinePhone(raw), "5493584123456", raw);
    assert.equal(normalizeArgentinePhone("4123456"), null);
  });

  it("la IP se guarda como HMAC (nunca en texto plano) y solo con clave", () => {
    const hashed = hashIp("k".repeat(32), "181.1.2.3");
    assert.ok(hashed && !hashed.includes("181") && hashed.length === 32);
    assert.equal(hashIp(null, "181.1.2.3"), null);
  });
});

/* ---------- Puntaje y sospecha ---------- */

/** Toques "humanos": ritmo con variación y posiciones distintas (determinista). */
function humanTaps(count: number, start = 0, gap = 90): Tap[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const taps: Tap[] = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    taps.push({ t: Math.round(t), x: 40 + Math.floor(rand() * 20), y: 40 + Math.floor(rand() * 20) });
    t += gap * (0.6 + rand() * 0.8);
  }
  return taps;
}

describe("puntaje calculado en el servidor", () => {
  it("nunca cuenta más de 20 por segundo ni fuera de los 15 s", () => {
    const taps = Array.from({ length: GAME_DURATION_MS / 40 + 10 }, (_, i) => ({ t: i * 40, x: 50, y: 50 }));
    assert.equal(scoreTaps(taps).accepted.length, 300);
  });

  it("un ritmo perfecto en el mismo punto se marca para revisión; uno humano no", () => {
    const robot = Array.from({ length: 120 }, (_, i) => ({ t: i * 100, x: 50, y: 50 }));
    const scoredRobot = scoreTaps(robot);
    assert.equal(assessGame(robot, scoredRobot.accepted, scoredRobot.ignored, 0).suspicion, "HIGH");
    const human = humanTaps(120);
    const scoredHuman = scoreTaps(human);
    assert.equal(assessGame(human, scoredHuman.accepted, scoredHuman.ignored, 0).suspicion, "NONE");
  });

  it("rechaza cuerpos mal formados", () => {
    assert.equal(parseFinishInput({ taps: [1, 2] }).ok, false);
    assert.equal(parseFinishInput({ taps: [0, 150, 50] }).ok, false);
    assert.equal(parseFinishInput({ taps: [0, 50, 50], untrusted: 0 }).ok, true);
  });
});

/* ---------- Flujo completo (repositorio en memoria) ---------- */

type MemoryParticipant = ParticipantRecord & { tokenHash: string; recoveryCodeHash: string | null; recoveryExpiresAt: Date | null };
type MemoryClaim = Pick<ClaimRecord, "editionId" | "participantId" | "gameId" | "status" | "name" | "phone" | "claimedAt" | "contactedAt" | "deliveredAt">;

function memoryChallenge() {
  const editions: EditionRecord[] = [];
  const people: MemoryParticipant[] = [];
  const games: GameRecord[] = [];
  const claims: MemoryClaim[] = [];
  const actions: string[] = [];
  const disqualified = new Set<string>();
  const invites: InviteRecord[] = [];
  const visits: { inviteId: string; visitorHash: string; ipHash: string | null }[] = [];
  const referrals: { editionId: string; inviteId: string; referrerId: string; referredId: string; sameConnection: boolean }[] = [];
  const isPublished = (e: EditionRecord) => (PUBLISHED_STATUSES as readonly string[]).includes(e.status);
  const strip = (p: MemoryParticipant): ParticipantRecord => ({
    id: p.id,
    instagram: p.instagram,
    ipHash: p.ipHash,
    duplicateAttempts: p.duplicateAttempts,
    lastDuplicateAt: p.lastDuplicateAt,
    createdAt: p.createdAt,
  });
  const toClaim = (c: MemoryClaim): ClaimRecord => {
    const e = editions.find((x) => x.id === c.editionId)!;
    return { ...c, editionNumber: e.number, editionName: e.name, prize: e.prize, prizeDescription: e.prizeDescription, isTest: e.isTest };
  };
  const conflictFor = (range: { startsAt: Date; endsAt: Date }, excludeId: string | null) =>
    editions.find((e) => e.id !== excludeId && isPublished(e) && overlaps(e, range)) ?? null;
  const nextNumber = (isTest: boolean) => editions.filter((e) => e.isTest === isTest).length + 1;
  const unused = async (): Promise<never> => {
    throw new Error("no usado en estos tests");
  };
  const repo: ChallengeRepository = {
    publicTournaments: async (now) => {
      const pub = editions.filter(isPublished);
      const live = pub.filter((e) => e.startsAt <= now && e.endsAt >= now).sort((a, b) => +b.startsAt - +a.startsAt)[0] ?? null;
      const lastEnded = pub.filter((e) => e.endsAt < now).sort((a, b) => +b.endsAt - +a.endsAt)[0] ?? null;
      const next = pub.filter((e) => e.startsAt > now).sort((a, b) => +a.startsAt - +b.startsAt)[0] ?? null;
      return { live, lastEnded, next };
    },
    getEdition: async (id) => editions.find((e) => e.id === id) ?? null,
    listEditions: async () =>
      editions.map((e) => {
        const own = games.filter((g) => g.editionId === e.id);
        return { ...e, games: own.length, participants: new Set(own.map((g) => g.participantId)).size };
      }),
    createEdition: async ({ status, ...data }): Promise<SaveResult> => {
      if (status === "SCHEDULED") {
        const conflict = conflictFor(data, null);
        if (conflict) return { ok: false, conflict: { id: conflict.id, name: conflict.name } };
      }
      const e = edition({ ...data, id: `t${editions.length + 1}`, number: nextNumber(data.isTest), status });
      editions.push(e);
      actions.push(status === "SCHEDULED" ? "CREATE_SCHEDULED" : "CREATE_DRAFT");
      return { ok: true, edition: e };
    },
    updateEdition: async (id, data, changes): Promise<SaveResult> => {
      const e = editions.find((x) => x.id === id);
      if (!e) return { ok: false, conflict: null };
      if (e.status !== "DRAFT") {
        const conflict = conflictFor(data, id);
        if (conflict) return { ok: false, conflict: { id: conflict.id, name: conflict.name } };
      }
      Object.assign(e, data);
      actions.push(`UPDATE:${changes.join(",")}`);
      return { ok: true, edition: e };
    },
    scheduleEdition: async (id): Promise<SaveResult> => {
      const e = editions.find((x) => x.id === id);
      if (!e || e.status !== "DRAFT") return { ok: false, conflict: null };
      const conflict = conflictFor(e, id);
      if (conflict) return { ok: false, conflict: { id: conflict.id, name: conflict.name } };
      e.status = "SCHEDULED";
      return { ok: true, edition: e };
    },
    cancelEdition: async (id, reason) => {
      const e = editions.find((x) => x.id === id);
      if (!e || e.status === "CANCELLED" || e.status === "RESULTS_PUBLISHED") return null;
      Object.assign(e, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason });
      actions.push("CANCEL");
      return e;
    },
    countPendingWinners: async (now) => editions.filter((e) => ["SCHEDULED", "ACTIVE", "PAUSED"].includes(e.status) && e.endsAt < now).length,
    countGames: async (editionId) => games.filter((g) => g.editionId === editionId).length,
    createParticipant: async (d) => {
      if (people.some((p) => p.instagram === d.instagram)) throw new DuplicateParticipantError();
      const p: MemoryParticipant = {
        id: `p${people.length + 1}`,
        instagram: d.instagram,
        ipHash: d.ipHash,
        duplicateAttempts: 0,
        lastDuplicateAt: null,
        createdAt: d.now,
        tokenHash: d.tokenHash,
        recoveryCodeHash: null,
        recoveryExpiresAt: null,
      };
      people.push(p);
      return strip(p);
    },
    noteDuplicate: async (instagram, now) => {
      const p = people.find((x) => x.instagram === instagram);
      if (p) Object.assign(p, { duplicateAttempts: p.duplicateAttempts + 1, lastDuplicateAt: now });
    },
    findParticipantByTokenHash: async (hash) => {
      const p = people.find((x) => x.tokenHash === hash);
      return p ? strip(p) : null;
    },
    setRecoveryCode: async (id, codeHash, expiresAt) => {
      const p = people.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, { recoveryCodeHash: codeHash, recoveryExpiresAt: expiresAt });
      return strip(p);
    },
    recover: async (instagram, codeHash, tokenHash, now) => {
      const p = people.find((x) => x.instagram === instagram && x.recoveryCodeHash === codeHash && x.recoveryExpiresAt! > now);
      if (!p) return null;
      Object.assign(p, { tokenHash, recoveryCodeHash: null, recoveryExpiresAt: null });
      return strip(p);
    },
    countAttempts: async (pid, editionId) => games.filter((g) => g.participantId === pid && g.editionId === editionId).length,
    createGame: async (d) => {
      if (games.some((g) => g.participantId === d.participantId && g.editionId === d.editionId && g.attemptNumber === d.attemptNumber)) return null;
      const game: GameRecord = {
        id: `g${games.length + 1}`,
        ...d,
        status: "STARTED",
        finishedAt: null,
        score: null,
        cookies: null,
        tapsReceived: null,
        tapsIgnored: null,
        untrustedTaps: null,
        flags: [],
        suspicion: "NONE",
        review: "NONE",
        reviewedAt: null,
        reviewedBy: null,
        reviewReason: null,
      };
      games.push(game);
      return game;
    },
    getGame: async (id) => games.find((g) => g.id === id) ?? null,
    findGameByRequest: async (pid, requestId) => games.find((g) => g.participantId === pid && g.clientRequestId === requestId) ?? null,
    getOrCreateInvite: async (editionId, participantId, ipHash) => {
      let invite = invites.find((i) => i.editionId === editionId && i.participantId === participantId);
      if (!invite) {
        invite = { id: `i${invites.length + 1}`, editionId, participantId, ipHash, code: `abcdefgh${"abcdefghjkmnpqrstuvwxyz"[invites.length]}k` };
        invites.push(invite);
      }
      return invite;
    },
    findInviteByCode: async (code) => invites.find((i) => i.code === code) ?? null,
    recordVisit: async (inviteId, visitorHash, ipHash) => {
      if (ipHash && visits.filter((v) => v.inviteId === inviteId && v.ipHash === ipHash).length >= MAX_VISITS_PER_CONNECTION) return false;
      if (visits.some((v) => v.inviteId === inviteId && v.visitorHash === visitorHash)) return false;
      visits.push({ inviteId, visitorHash, ipHash });
      return true;
    },
    recordReferral: async (data) => {
      if (data.referrerId === data.referredId || referrals.some((r) => r.editionId === data.editionId && r.referredId === data.referredId)) return false;
      referrals.push(data);
      return true;
    },
    inviteStats: async (editionId) => {
      const own = invites.filter((i) => i.editionId === editionId);
      const top = own
        .map((i) => ({
          participantId: i.participantId,
          instagram: people.find((p) => p.id === i.participantId)!.instagram,
          visits: visits.filter((v) => v.inviteId === i.id).length,
          registrations: referrals.filter((r) => r.inviteId === i.id && !r.sameConnection).length,
          sameConnection: referrals.filter((r) => r.inviteId === i.id && r.sameConnection).length,
        }))
        .filter((r) => r.visits || r.registrations || r.sameConnection)
        .sort((a, b) => b.registrations - a.registrations || b.visits - a.visits);
      return {
        invites: own.length,
        visits: top.reduce((t, r) => t + r.visits, 0),
        registrations: top.reduce((t, r) => t + r.registrations, 0),
        sameConnection: top.reduce((t, r) => t + r.sameConnection, 0),
        top,
      };
    },
    finishGame: async (id, result) => {
      const game = games.find((g) => g.id === id);
      if (!game || game.status !== "STARTED") return null;
      Object.assign(game, result, { status: "FINISHED", review: result.suspicion === "NONE" ? "NONE" : "PENDING" });
      return game;
    },
    expireGame: async (id) => {
      const game = games.find((g) => g.id === id);
      if (game?.status === "STARTED") game.status = "EXPIRED";
    },
    ranking: async (editionId) => {
      const bestByPerson = new Map<string, GameRecord>();
      for (const g of games) {
        if (g.editionId !== editionId || g.status !== "FINISHED" || g.review === "REJECTED" || disqualified.has(`${editionId}:${g.participantId}`)) continue;
        const current = bestByPerson.get(g.participantId);
        if (!current || g.score! > current.score! || (g.score === current.score && g.finishedAt! < current.finishedAt!)) bestByPerson.set(g.participantId, g);
      }
      return [...bestByPerson.values()]
        .sort((a, b) => b.score! - a.score! || a.finishedAt!.getTime() - b.finishedAt!.getTime())
        .map((g): RankingRow => ({ participantId: g.participantId, instagram: people.find((p) => p.id === g.participantId)!.instagram, score: g.score!, achievedAt: g.finishedAt!, gameId: g.id }));
    },
    isDisqualified: async (editionId, pid) => disqualified.has(`${editionId}:${pid}`),
    claimsOf: async (pid) => claims.filter((c) => c.participantId === pid).map(toClaim),
    submitClaim: async (editionId, pid, data, now) => {
      const c = claims.find((x) => x.editionId === editionId && x.participantId === pid && x.status === "PENDING");
      if (!c) return null;
      Object.assign(c, { status: "CLAIMED", ...data, claimedAt: now });
      return toClaim(c);
    },
    getClaim: async (editionId) => {
      const c = claims.find((x) => x.editionId === editionId);
      return c ? toClaim(c) : null;
    },
    setClaimStatus: async (editionId, status) => {
      const c = claims.find((x) => x.editionId === editionId);
      if (!c || c.status === "DELIVERED" || (status === "CONTACTED" && c.status === "CONTACTED")) return null;
      c.status = status;
      return toClaim(c);
    },
    stats: async (editionId) => {
      const own = games.filter((g) => g.editionId === editionId);
      return { participants: new Set(own.map((g) => g.participantId)).size, games: own.length, finished: own.filter((g) => g.status === "FINISHED").length, pendingReview: 0 };
    },
    adminRanking: async () => [],
    listGames: unused,
    listParticipants: unused,
    duplicateAlerts: async (editionId) => {
      const byIp = new Map<string, Set<string>>();
      for (const g of games.filter((x) => x.editionId === editionId && x.ipHash)) {
        if (!byIp.has(g.ipHash!)) byIp.set(g.ipHash!, new Set());
        byIp.get(g.ipHash!)!.add(g.participantId);
      }
      return [...byIp]
        .filter(([, ids]) => ids.size > 1)
        .map(([ipHash, ids]) => ({ ipHash, participants: [...ids].map((id) => ({ id, instagram: people.find((p) => p.id === id)!.instagram })) }));
    },
    listDisqualifications: async () => [],
    listActions: async () => [],
    setPaused: async (id, paused) => {
      const e = editions.find((x) => x.id === id);
      if (!e) return null;
      e.status = paused ? "PAUSED" : "SCHEDULED";
      return e;
    },
    reviewGame: unused,
    disqualify: async (editionId, pid) => {
      if (disqualified.has(`${editionId}:${pid}`)) return false;
      disqualified.add(`${editionId}:${pid}`);
      return true;
    },
    reinstate: async (editionId, pid) => disqualified.delete(`${editionId}:${pid}`),
    publishResults: async (editionId, winner) => {
      const e = editions.find((x) => x.id === editionId);
      if (!e || !["SCHEDULED", "ACTIVE", "PAUSED"].includes(e.status)) return null;
      Object.assign(e, { status: "RESULTS_PUBLISHED", winnerParticipantId: winner?.participantId ?? null, winnerGameId: winner?.gameId ?? null, winnerScore: winner?.score ?? null });
      if (winner) claims.push({ editionId, participantId: winner.participantId, gameId: winner.gameId, status: "PENDING", name: null, phone: null, claimedAt: null, contactedAt: null, deliveredAt: null });
      return e;
    },
  };
  return { repo, editions, people, actions, games, invites, visits, referrals };
}

const ORIGIN = "https://sweetcookies-seven.vercel.app";
const IP_SECRET = "clave-de-prueba-para-el-hmac-de-ip!!";

function setup(options: { official?: boolean } = {}) {
  let clock = new Date("2026-10-28T15:00:00Z"); // miércoles 28/10 12:00 en Córdoba
  const settings: SettingsRepository = {
    get: async () => ({ ...DEFAULT_SETTINGS, instagramHandle: "@sweet.cookies.rio4", updatedAt: null }),
    update: async () => {
      throw new Error("no usado");
    },
    updateOrders: async () => {
      throw new Error("no usado");
    },
    ping: async () => undefined,
  };
  const memory = memoryChallenge();
  const app = new Hono<{ Variables: { userId: string } }>();
  // Las rutas admin reales pasan por Clerk + ADMIN_EMAILS antes; acá basta con fijar el usuario.
  app.use("/api/admin/*", async (c, next) => {
    c.set("userId", "admin_test");
    await next();
  });
  registerChallengeRoutes(app, {
    challenge: memory.repo,
    settings,
    allowedOrigins: [ORIGIN],
    log: () => undefined,
    now: () => clock,
    config: { official: options.official ?? true, ipSecret: IP_SECRET, trustProxy: "fly" },
  });
  const call = (path: string, init: { method?: string; token?: string; body?: unknown; ip?: string } = {}) =>
    app.request(path, {
      method: init.method ?? "GET",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "Fly-Client-IP": init.ip ?? "181.10.0.1",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const join = async (handle: string, ip?: string) => {
    const res = await call("/api/challenge/register", { method: "POST", body: { instagram: handle, terms: true }, ip });
    assert.equal(res.status, 201);
    return (await json(res)).token as string;
  };
  const play = async (token: string, taps: Tap[], ip?: string) => {
    const start = await call("/api/challenge/games", { method: "POST", token, ip });
    assert.equal(start.status, 201, JSON.stringify(await start.clone().json()));
    const { game } = await json(start);
    clock = new Date(clock.getTime() + 17_000);
    return call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, ip, body: { taps: taps.flatMap((t) => [t.t, t.x, t.y]), untrusted: 0 } });
  };
  /** Crea un torneo desde el "panel". */
  const create = async (over: Record<string, unknown> = {}, schedule = true) => {
    const res = await call("/api/admin/challenge/editions", { method: "POST", body: { ...form(), ...over, schedule } });
    return { status: res.status, data: await json(res) };
  };
  const advance = (ms: number) => (clock = new Date(clock.getTime() + ms));
  const setClock = (iso: string) => (clock = new Date(iso));
  return { call, join, play, create, advance, setClock, memory };
}

/** Torneo que ya está en curso: empieza hoy (28/10) 11:00 y termina el 29/10 23:59 (Córdoba). */
const runningNow = (over: Record<string, unknown> = {}) => ({ startDate: "2026-10-28", startTime: "11:00", endDate: "2026-10-29", endTime: "23:59", ...over });

describe("torneos: creación, programación y estados", () => {
  it("sin torneo no hay competencia oficial (no se crea ninguno solo) y se puede igual participar con el @", async () => {
    const { call, join, memory } = setup();
    const info = await json(await call("/api/public/challenge"));
    assert.equal(info.tournament, null);
    assert.equal(info.next, null);
    const token = await join("@ana");
    const me = await json(await call("/api/challenge/me", { token }));
    assert.equal(me.tournament, null);
    assert.equal(me.attempts, null);
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
    assert.equal(memory.editions.length, 0);
  });

  it("borrador: no se ve en la página; al programarlo queda visible", async () => {
    const { call, create } = setup();
    const draft = await create({}, false);
    assert.equal(draft.status, 201);
    assert.equal(draft.data.status, "DRAFT");
    assert.equal((await json(await call("/api/public/challenge"))).tournament, null);
    const scheduled = await json(await call(`/api/admin/challenge/editions/${draft.data.id}/schedule`, { method: "POST" }));
    assert.equal(scheduled.status, "SCHEDULED");
    const info = await json(await call("/api/public/challenge"));
    assert.equal(info.tournament.name, "Desafío Halloween");
    assert.equal(info.tournament.status, "SCHEDULED");
    assert.equal(info.tournament.prize, "Caja de 6 cookies");
  });

  it("se activa sola al llegar el inicio y finaliza sola al cierre (hora del servidor)", async () => {
    const { call, create, join, setClock } = setup();
    await create();
    const token = await join("@ana");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409); // programado
    setClock("2026-10-30T21:00:00Z"); // 30/10 18:00 Córdoba
    assert.equal((await json(await call("/api/public/challenge"))).tournament.status, "ACTIVE");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 201);
    setClock("2026-11-01T03:00:00Z"); // 31/10 24:00 Córdoba
    const info = await json(await call("/api/public/challenge"));
    assert.equal(info.tournament.status, "FINISHED");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
  });

  it("rechaza torneos superpuestos y permite varios futuros sin superposición", async () => {
    const { create } = setup();
    assert.equal((await create()).status, 201);
    const overlap = await create({ name: "Otro", startDate: "2026-10-31", startTime: "10:00", endDate: "2026-11-02", endTime: "10:00" });
    assert.equal(overlap.status, 409);
    assert.equal(overlap.data.error, "overlap");
    assert.equal((await create({ name: "Noviembre", startDate: "2026-11-05", startTime: "10:00", endDate: "2026-11-20", endTime: "20:00" })).status, 201);
    // Los borradores pueden superponerse (se valida al programarlos).
    assert.equal((await create({ name: "Borrador" }, false)).status, 201);
  });

  it("rechaza fechas inválidas y un torneo que ya terminó", async () => {
    const { create } = setup();
    assert.equal((await create({ endDate: "2026-10-29" })).status, 422);
    assert.equal((await create({ startDate: "2026-10-01", endDate: "2026-10-02" })).status, 422);
  });

  it("los oficiales solo se publican con CHALLENGE_MODE=official; los de prueba siempre", async () => {
    const { create } = setup({ official: false });
    const locked = await create({ mode: "official" });
    assert.equal(locked.status, 409);
    assert.equal(locked.data.error, "official_locked");
    assert.equal((await create({ mode: "official" }, false)).status, 201); // borrador sí
    assert.equal((await create({ mode: "test", name: "Prueba", startDate: "2026-11-05", endDate: "2026-11-06" })).status, 201);
  });

  it("cancelación con motivo: conserva el historial y deja de aceptar partidas", async () => {
    const { call, create, join, play } = setup();
    const t = await create(runningNow());
    const token = await join("@ana");
    assert.equal((await play(token, humanTaps(20))).status, 200);
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}/cancel`, { method: "POST", body: {} })).status, 422);
    const cancelled = await json(await call(`/api/admin/challenge/editions/${t.data.id}/cancel`, { method: "POST", body: { reason: "Error en el premio" } }));
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
    const list = await json(await call("/api/admin/challenge/editions"));
    assert.equal(list.editions[0].games, 1); // se conserva
  });

  it("edición por la API: en curso no se pueden bajar intentos ni adelantar el cierre; cambiar el premio exige confirmación", async () => {
    const { call, create, join, play, memory } = setup();
    const t = await create(runningNow({ attempts: 3 }));
    await play(await join("@ana"), humanTaps(10));
    const put = (body: Record<string, unknown>) => call(`/api/admin/challenge/editions/${t.data.id}`, { method: "PUT", body: { ...form(runningNow({ attempts: 3 })), ...body } });
    assert.equal((await json(await put({ attempts: 2, reason: "x x x" }))).error, "attempts_reduced");
    assert.equal((await json(await put({ endTime: "20:00", reason: "x x x" }))).error, "end_shortened");
    assert.equal((await json(await put({ prize: "Combo especial", reason: "x x x" }))).error, "prize_change_unconfirmed");
    assert.equal((await json(await put({ attempts: 5 }))).error, "reason_required");
    const ok = await put({ attempts: 5, reason: "Más intentos para todos" });
    assert.equal(ok.status, 200);
    assert.equal((await json(ok)).attempts, 5);
    assert.ok(memory.actions.some((a) => a === "UPDATE:attempts"));
  });

  it("compatibilidad: la edición semanal anterior (estado ACTIVE guardado) sigue como torneo de prueba con sus datos", async () => {
    const { call, memory, setClock } = setup();
    memory.editions.push(
      edition({
        id: "legacy",
        isTest: true,
        name: "Prueba · semana del 19/10/2026",
        weekStart: "2026-10-19",
        status: "ACTIVE",
        attempts: 3,
        prize: "Caja de 3 cookies",
        prizeDescription: null,
        startsAt: new Date("2026-10-19T03:00:00Z"),
        endsAt: new Date("2026-10-24T02:59:59.999Z"),
      }),
    );
    setClock("2026-10-22T18:00:00Z");
    const live = await json(await call("/api/public/challenge"));
    assert.equal(live.tournament.status, "ACTIVE");
    assert.equal(live.tournament.isTest, true);
    setClock("2026-10-25T12:00:00Z");
    assert.equal((await json(await call("/api/public/challenge"))).tournament.status, "FINISHED");
    // Su fecha no bloquea torneos posteriores.
    const res = await call("/api/admin/challenge/editions", { method: "POST", body: { ...form({ startDate: "2026-10-26", endDate: "2026-10-27" }), schedule: true } });
    assert.equal(res.status, 201);
  });
});

describe("torneos: intentos configurables, ranking y premio", () => {
  it("torneo con 3 intentos: el 4.º se rechaza; torneo con 5: el 6.º se rechaza", async () => {
    for (const attempts of [3, 5]) {
      const { call, create, join } = setup();
      await create(runningNow({ attempts }));
      const token = await join("@ana");
      for (let i = 0; i < attempts; i++) assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 201);
      const extra = await call("/api/challenge/games", { method: "POST", token });
      assert.equal(extra.status, 429);
      const body = await json(extra);
      assert.equal(body.error, "no_attempts");
      assert.deepEqual(body.attempts, { limit: attempts, used: attempts, left: 0 });
    }
  });

  it("los intentos no se reinician con los días ni se trasladan a otro torneo", async () => {
    const { call, create, join, advance, setClock } = setup();
    await create(runningNow({ attempts: 3, endDate: "2026-11-02" }));
    const token = await join("@ana");
    for (let i = 0; i < 3; i++) await call("/api/challenge/games", { method: "POST", token });
    advance(DAY);
    assert.equal((await json(await call("/api/challenge/me", { token }))).attempts.left, 0);
    await create({ name: "Noviembre", attempts: 5, startDate: "2026-11-05", startTime: "10:00", endDate: "2026-11-06", endTime: "10:00" });
    setClock("2026-11-05T14:00:00Z");
    const me = await json(await call("/api/challenge/me", { token }));
    assert.equal(me.tournament.name, "Noviembre");
    assert.deepEqual(me.attempts, { limit: 5, used: 0, left: 5 });
  });

  it("mismo participante en varios torneos, cada uno con su ranking y su premio", async () => {
    const { call, create, join, play, setClock } = setup();
    await create(runningNow({ name: "Torneo A", prize: "Caja de 3 cookies" }));
    const ana = await join("@ana");
    const beto = await join("@beto");
    await play(ana, humanTaps(40));
    await play(beto, humanTaps(30));
    const a = await json(await call("/api/public/challenge"));
    assert.equal(a.tournament.prize, "Caja de 3 cookies");
    assert.deepEqual(a.leaderboard.map((r: { handle: string }) => r.handle), ["@ana", "@beto"]);

    await create({ name: "Torneo B", prize: "Combo especial", startDate: "2026-11-05", startTime: "10:00", endDate: "2026-11-06", endTime: "10:00" });
    setClock("2026-11-05T14:00:00Z");
    await play(beto, humanTaps(60));
    const b = await json(await call("/api/public/challenge"));
    assert.equal(b.tournament.name, "Torneo B");
    assert.equal(b.tournament.prize, "Combo especial");
    assert.deepEqual(b.leaderboard.map((r: { handle: string; score: number }) => [r.handle, r.score]), [["@beto", 60]]);
  });

  it("el último torneo terminado se muestra con el próximo como aviso", async () => {
    const { call, create, setClock } = setup();
    await create(runningNow({ name: "Torneo A" }));
    await create({ name: "Torneo B", startDate: "2026-11-05", startTime: "10:00", endDate: "2026-11-06", endTime: "10:00" });
    setClock("2026-10-31T12:00:00Z");
    const info = await json(await call("/api/public/challenge"));
    assert.equal(info.tournament.name, "Torneo A");
    assert.equal(info.tournament.status, "FINISHED");
    assert.equal(info.next.name, "Torneo B");
  });

  it("reclamo exclusivo del ganador confirmado, con el premio de SU torneo; nada privado en lo público", async () => {
    const { call, create, join, play, setClock } = setup();
    const t = await create(runningNow({ prize: "Caja de 6 cookies", mode: "official" }));
    const winner = await join("@ganadora");
    const other = await join("@segundo");
    await play(winner, humanTaps(80));
    await play(other, humanTaps(50));
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}/publish`, { method: "POST", body: {} })).status, 409); // sigue abierto
    setClock("2026-10-30T12:00:00Z");
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}/publish`, { method: "POST", body: { reason: "Revisado" } })).status, 200);

    const me = await json(await call("/api/challenge/me", { token: winner }));
    assert.equal(me.claims.length, 1);
    assert.equal(me.claims[0].prize, "Caja de 6 cookies");
    assert.equal(me.claims[0].isTest, false);
    assert.equal((await call(`/api/challenge/claims/${t.data.id}`, { method: "POST", token: other, body: { name: "Intruso", phone: "358 400-0000" } })).status, 403);
    assert.equal((await call(`/api/challenge/claims/${t.data.id}`, { method: "POST", token: winner, body: { name: "Ana Pérez", phone: "0358 15 412-3456" } })).status, 200);
    assert.equal((await call(`/api/challenge/claims/${t.data.id}`, { method: "POST", token: winner, body: { name: "Ana Pérez", phone: "358 412-3456" } })).status, 409);

    const info = await json(await call("/api/public/challenge"));
    assert.equal(info.tournament.status, "RESULTS_PUBLISHED");
    assert.equal(info.winner.handle, "@ganadora");
    const text = JSON.stringify(info) + JSON.stringify(await json(await call("/api/challenge/me", { token: winner })));
    assert.ok(!text.includes("5493584123456") && !text.includes("Pérez") && !text.includes("participantId") && !text.includes("181.10"));
  });

  it("torneo de prueba: el premio se marca como no real", async () => {
    const { call, create, join, play, setClock } = setup();
    const t = await create(runningNow({ mode: "test" }));
    const token = await join("@ana");
    await play(token, humanTaps(30));
    setClock("2026-10-30T12:00:00Z");
    await call(`/api/admin/challenge/editions/${t.data.id}/publish`, { method: "POST", body: {} });
    const me = await json(await call("/api/challenge/me", { token }));
    assert.equal(me.claims[0].isTest, true);
    assert.equal(me.tournament.isTest, true);
  });
});

describe("sesión, IP y recuperación (sin cambios de reglas)", () => {
  it("el mismo @ desde otro navegador no obtiene otra sesión; con sesión no se cambia de @", async () => {
    const { call, join, memory } = setup();
    const token = await join("@ana");
    const again = await call("/api/challenge/register", { method: "POST", body: { instagram: "@ANA", terms: true } });
    assert.equal(again.status, 409);
    assert.equal(memory.people[0].duplicateAttempts, 1);
    assert.equal((await call("/api/challenge/register", { method: "POST", token, body: { instagram: "@otra", terms: true } })).status, 409);
  });

  it("recuperación con código de un solo uso conserva los intentos usados en el torneo", async () => {
    const { call, create, join } = setup();
    await create(runningNow({ attempts: 4 }));
    const oldToken = await join("@ana");
    await call("/api/challenge/games", { method: "POST", token: oldToken });
    const { code } = await json(await call("/api/admin/challenge/participants/p1/recovery", { method: "POST", body: {} }));
    const recovered = await json(await call("/api/challenge/recover", { method: "POST", body: { instagram: "@ana", code } }));
    assert.equal((await call("/api/challenge/me", { token: oldToken })).status, 401);
    assert.deepEqual((await json(await call("/api/challenge/me", { token: recovered.token }))).attempts, { limit: 4, used: 1, left: 3 });
  });

  it("IP compartida: dos @ desde la misma conexión juegan; el resumen del panel muestra la alerta", async () => {
    const { call, create, join, play } = setup();
    await create(runningNow());
    const a = await join("@mama", "200.1.1.1");
    const b = await join("@hijo", "200.1.1.1");
    assert.equal((await play(a, humanTaps(30), "200.1.1.1")).status, 200);
    assert.equal((await play(b, humanTaps(40), "200.1.1.1")).status, 200);
    const overview = await json(await call("/api/admin/challenge/overview"));
    assert.equal(overview.liveAlerts, 1);
    assert.equal(overview.live.name, "Desafío Halloween");
    assert.equal(overview.liveStats.participants, 2);
  });

  it("el puntaje sale de los toques y no se puede cerrar antes de tiempo ni dos veces", async () => {
    const { call, create, join, advance } = setup();
    await create(runningNow());
    const token = await join("@ana");
    const { game } = await json(await call("/api/challenge/games", { method: "POST", token }));
    const body = { taps: humanTaps(50).flatMap((t) => [t.t, t.x, t.y]), untrusted: 0, score: 9999 };
    assert.equal((await call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, body })).status, 409);
    advance(17_000);
    assert.equal((await json(await call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, body }))).result.score, 50);
    assert.equal((await json(await call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, body }))).repeated, true);
  });

  it("partida que empieza segundos antes del cierre: se acepta; mucho después del cierre, vence", async () => {
    const { call, create, join, setClock } = setup();
    await create(runningNow());
    const token = await join("@ana");
    setClock("2026-10-30T02:59:50Z"); // 29/10 23:59:50 Córdoba, 10 s antes del cierre
    const late = await json(await call("/api/challenge/games", { method: "POST", token }));
    setClock("2026-10-30T03:00:10Z");
    assert.equal((await call(`/api/challenge/games/${late.game.id}/finish`, { method: "POST", token, body: { taps: [100, 50, 50], untrusted: 0 } })).status, 200);

    const { call: call2, create: create2, join: join2, setClock: set2 } = setup();
    await create2(runningNow());
    const t2 = await join2("@beto");
    set2("2026-10-30T02:59:50Z");
    const g = await json(await call2("/api/challenge/games", { method: "POST", token: t2 }));
    set2("2026-10-30T03:10:00Z"); // 10 min después del cierre
    assert.equal((await json(await call2(`/api/challenge/games/${g.game.id}/finish`, { method: "POST", token: t2, body: { taps: [], untrusted: 0 } }))).error, "expired");
  });
});

describe("partidas: sin práctica y sin intentos duplicados", () => {
  it("no hay ninguna ruta pública para jugar sin consumir un intento", async () => {
    const { call } = setup();
    for (const path of ["/api/challenge/practice", "/api/public/challenge/practice", "/api/challenge/games/practice"]) {
      assert.equal((await call(path, { method: "POST", body: {} })).status, 404, path);
    }
  });

  it("sin registrarse no se puede jugar; sin torneo activo tampoco", async () => {
    const { call, create, join } = setup();
    assert.equal((await call("/api/challenge/games", { method: "POST" })).status, 401);
    const token = await join("@ana");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
    await create(runningNow());
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 201);
  });

  it("doble toque / reintento de red con el mismo id de pedido: una sola partida y un solo intento", async () => {
    const { call, create, join, memory } = setup();
    await create(runningNow({ attempts: 3 }));
    const token = await join("@ana");
    const body = { requestId: "pedido-unico-0001-abcdef" };
    const [a, b] = await Promise.all([call("/api/challenge/games", { method: "POST", token, body }), call("/api/challenge/games", { method: "POST", token, body })]);
    const again = await json(await call("/api/challenge/games", { method: "POST", token, body }));
    const ids = new Set([(await json(a)).game.id, (await json(b)).game.id, again.game.id]);
    assert.equal(ids.size, 1);
    assert.equal(memory.games.length, 1);
    assert.equal(again.attempts.left, 2);
    assert.equal(again.replayed, true);
    // Un toque nuevo (otro id) sí es otra partida.
    assert.equal((await call("/api/challenge/games", { method: "POST", token, body: { requestId: "pedido-unico-0002-abcdef" } })).status, 201);
    assert.equal((await json(await call("/api/challenge/me", { token }))).attempts.left, 1);
  });
});

describe("invitaciones entre amigos", () => {
  const visit = (call: ReturnType<typeof setup>["call"], ref: string, visitor: string, ip?: string, token?: string) =>
    call("/api/challenge/visits", { method: "POST", body: { ref, visitor }, ip, token });

  it("cada participante tiene un enlace propio por torneo, con un código público (sin datos privados)", async () => {
    const { call, create, join, memory } = setup();
    const t = await create(runningNow());
    const token = await join("@ana");
    assert.equal((await call("/api/challenge/invites", { method: "POST" })).status, 401);
    const first = await json(await call("/api/challenge/invites", { method: "POST", token }));
    const second = await json(await call("/api/challenge/invites", { method: "POST", token }));
    assert.match(first.code, /^[a-z2-9]{10}$/);
    assert.equal(first.code, second.code);
    assert.equal(first.tournamentId, t.data.id);
    const text = JSON.stringify(first);
    assert.ok(!text.includes(memory.people[0].id) && !text.includes(token) && !text.includes("ana"));
  });

  it("sin torneo visible no hay enlace", async () => {
    const { call, join } = setup();
    const token = await join("@ana");
    assert.equal((await call("/api/challenge/invites", { method: "POST", token })).status, 409);
  });

  it("el enlace abre el torneo correcto, también si terminó o se canceló; uno inválido no rompe ni revela nada", async () => {
    const { call, create, setClock } = setup();
    const a = await create(runningNow({ name: "Torneo A" }));
    await create({ name: "Torneo B", startDate: "2026-11-05", startTime: "10:00", endDate: "2026-11-06", endTime: "10:00" });
    const draft = await create({ name: "Secreto", startDate: "2026-12-01", endDate: "2026-12-02" }, false);
    setClock("2026-11-05T14:00:00Z"); // B en curso, A terminado
    const linked = await json(await call(`/api/public/challenge?torneo=${a.data.id}`));
    assert.equal(linked.tournament.name, "Torneo A");
    assert.equal(linked.tournament.status, "FINISHED");
    assert.equal(linked.next.name, "Torneo B");
    assert.equal(linked.linkStatus, "ok");
    for (const bad of ["no-existe-123", draft.data.id, "<script>"]) {
      const res = await call(`/api/public/challenge?torneo=${encodeURIComponent(bad)}`);
      assert.equal(res.status, 200);
      const body = await json(res);
      assert.equal(body.linkStatus, "invalid");
      assert.equal(body.tournament.name, "Torneo B");
      assert.ok(!JSON.stringify(body).includes("Secreto"));
    }
    await call(`/api/admin/challenge/editions/${a.data.id}/cancel`, { method: "POST", body: { reason: "Prueba de cancelación" } });
    assert.equal((await json(await call(`/api/public/challenge?torneo=${a.data.id}`))).tournament.status, "CANCELLED");
  });

  it("visitas: una por visitante, quien invita no se cuenta a sí mismo, y hay tope por conexión", async () => {
    const { call, create, join, memory } = setup();
    await create(runningNow());
    const ana = await join("@ana");
    const { code } = await json(await call("/api/challenge/invites", { method: "POST", token: ana }));
    assert.equal((await visit(call, code, "visitante-aaaaaaaaaaaa", "10.0.0.1")).status, 204);
    await visit(call, code, "visitante-aaaaaaaaaaaa", "10.0.0.1"); // repetido
    await visit(call, code, "visitante-bbbbbbbbbbbb", "10.0.0.2");
    await visit(call, code, "visitante-propio-xxxxx", "181.10.0.1", ana); // la propia Ana
    assert.equal(memory.visits.length, 2);
    for (let i = 0; i < 10; i++) await visit(call, code, `bot-visitante-${String(i).padStart(6, "0")}`, "66.6.6.6");
    assert.equal(memory.visits.filter((v) => v.ipHash !== null).length, 2 + MAX_VISITS_PER_CONNECTION);
    // Un código inexistente o mal formado responde igual y no guarda nada.
    assert.equal((await visit(call, "zzzzzzzzzz", "visitante-cccccccccccc")).status, 204);
    assert.equal((await visit(call, "x", "y")).status, 204);
    assert.equal(memory.visits.length, 2 + MAX_VISITS_PER_CONNECTION);
  });

  it("registro referido: se atribuye en el servidor, una sola vez, sin intentos extra; misma conexión va aparte", async () => {
    const { call, create, join } = setup();
    const t = await create(runningNow({ attempts: 3 }));
    const ana = await join("@ana", "181.10.0.1");
    const { code } = await json(await call("/api/challenge/invites", { method: "POST", token: ana, ip: "181.10.0.1" }));
    const register = (handle: string, ip: string) => call("/api/challenge/register", { method: "POST", ip, body: { instagram: handle, terms: true, ref: code } });
    const beto = (await json(await register("@beto", "190.1.1.1"))).token;
    await register("@ana.hermana", "181.10.0.1"); // misma conexión que Ana
    // El referido tiene los mismos intentos que cualquiera.
    assert.deepEqual((await json(await call("/api/challenge/me", { token: beto }))).attempts, { limit: 3, used: 0, left: 3 });
    // Un @ ya registrado que vuelve a intentar con el enlace no cuenta otra vez.
    await register("@beto", "190.1.1.1");
    const stats = await json(await call(`/api/admin/challenge/editions/${t.data.id}/invites`));
    assert.equal(stats.registrations, 1);
    assert.equal(stats.sameConnection, 1);
    assert.equal(stats.invites, 1);
    assert.deepEqual(stats.top[0], { instagram: "ana", visits: 0, registrations: 1, sameConnection: 1 });
    assert.equal(stats.conversion, null); // sin visitas registradas no se puede calcular
    assert.ok(!JSON.stringify(stats).includes("participantId") && !JSON.stringify(stats).includes("190.1.1.1"));
  });

  it("las métricas se separan por torneo y el ranking competitivo no cambia", async () => {
    const { call, create, join, play, setClock } = setup();
    const a = await create(runningNow({ name: "Torneo A" }));
    const ana = await join("@ana");
    await play(ana, humanTaps(20));
    const { code } = await json(await call("/api/challenge/invites", { method: "POST", token: ana }));
    const beto = (await json(await call("/api/challenge/register", { method: "POST", ip: "190.1.1.1", body: { instagram: "@beto", terms: true, ref: code } }))).token;
    await play(beto, humanTaps(50));
    const board = await json(await call("/api/public/challenge"));
    // Ana invitó a Beto, pero gana quien tiene más mordidas: sin puntos ni ventajas por invitar.
    assert.deepEqual(board.leaderboard.map((r: { handle: string; score: number }) => [r.handle, r.score]), [["@beto", 50], ["@ana", 20]]);
    const b = await create({ name: "Torneo B", startDate: "2026-11-05", startTime: "10:00", endDate: "2026-11-06", endTime: "10:00" });
    setClock("2026-11-05T14:00:00Z");
    assert.equal((await json(await call(`/api/admin/challenge/editions/${a.data.id}/invites`))).registrations, 1);
    assert.equal((await json(await call(`/api/admin/challenge/editions/${b.data.id}/invites`))).registrations, 0);
    const newCode = (await json(await call("/api/challenge/invites", { method: "POST", token: ana }))).code;
    assert.notEqual(newCode, code); // un enlace distinto por torneo
  });

  it("un código de un torneo cancelado no atribuye registros", async () => {
    const { call, create, join, memory } = setup();
    const t = await create(runningNow());
    const ana = await join("@ana");
    const { code } = await json(await call("/api/challenge/invites", { method: "POST", token: ana }));
    await call(`/api/admin/challenge/editions/${t.data.id}/cancel`, { method: "POST", body: { reason: "Cancelado por prueba" } });
    await call("/api/challenge/register", { method: "POST", ip: "190.1.1.1", body: { instagram: "@beto", terms: true, ref: code } });
    assert.equal(memory.referrals.length, 0);
  });
});
