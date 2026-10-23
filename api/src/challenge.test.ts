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
  normalizeFullName,
  normalizeInstagram,
  normalizePhone,
  overlaps,
  parseFinishInput,
  scoreTaps,
  validateContact,
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

/** Datos de contacto que pide el registro (nombre y apellido + WhatsApp). */
const CONTACT = { name: "Ana Pérez", phone: "358 412-3456" };

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
    // Ya no hay modo prueba: cualquier "mode" se ignora y el torneo es real.
    const anyMode = validateTournament(form({ mode: "test" }));
    assert.ok(anyMode.ok && anyMode.data.isTest === false);
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
    prizeImageUrl: null,
    minParticipants: null,
    cancelledAt: null,
    cancelReason: null,
    deletedAt: null,
    deleteReason: null,
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

  it("antes del inicio y sin partidas se puede cambiar todo; históricos de prueba y eliminados no se editan", () => {
    const ctx = { games: 0, reason: null, confirmPrizeChange: false, now: before };
    assert.ok(checkTournamentEdit(edition(), "SCHEDULED", input({ attempts: 2, startTime: "20:00", prize: "Combo" }), ctx).ok);
    assert.ok(checkTournamentEdit(edition({ status: "UNPUBLISHED" }), "UNPUBLISHED", input({ attempts: 2 }), ctx).ok);
    assert.equal((checkTournamentEdit(edition({ isTest: true }), "SCHEDULED", input(), ctx) as { error: string }).error, "legacy");
    assert.equal((checkTournamentEdit(edition({ deletedAt: new Date() }), "DRAFT", input(), ctx) as { error: string }).error, "deleted");
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

  it("para competir se piden @, nombre y apellido, WhatsApp y aceptar las bases (los cuatro obligatorios)", () => {
    assert.equal(validateJoin({ instagram: "@ana", ...CONTACT }).ok, false);
    assert.equal(validateJoin({ instagram: "@ana", terms: true }).ok, false);
    const missing = validateJoin({ instagram: "", name: "Ana", phone: "12", terms: false });
    assert.ok(!missing.ok && missing.errors.instagram && missing.errors.name && missing.errors.phone && missing.errors.terms);
    const ok = validateJoin({ instagram: "@Ana", ...CONTACT, terms: true });
    assert.ok(ok.ok && ok.instagram === "ana" && ok.contact.name === "Ana Pérez" && ok.contact.phone === "5493584123456");
  });

  it("nombre y apellido: al menos dos palabras, solo letras", () => {
    assert.equal(normalizeFullName("  ana   pérez "), "ana pérez");
    assert.equal(normalizeFullName("María José O'Neill-Díaz"), "María José O'Neill-Díaz");
    assert.equal(normalizeFullName("Ana"), null);
    assert.equal(normalizeFullName("Ana 123"), null);
    assert.equal(normalizeFullName("<script> x"), null);
  });

  it("WhatsApp argentino en cualquier formato habitual; internacional con + y código de país", () => {
    for (const raw of ["358 412-3456", "0358 15 412-3456", "+54 9 358 412 3456", "5493584123456", "(0358) 154-123456", "0054 9 358 4123456"]) {
      assert.equal(normalizePhone(raw), "5493584123456", raw);
    }
    assert.equal(normalizePhone("11 2345-6789"), "5491123456789");
    assert.equal(normalizePhone("+1 (415) 555-0100"), "14155550100");
    assert.equal(normalizePhone("+34 612 34 56 78"), "34612345678");
    assert.equal(normalizePhone("0034 612 345 678"), "34612345678");
    for (const bad of ["4123456", "", "abc", "358-412-3456 ext 2", "+1 23", "+0 1234567890", "+54 9 12", "1234567890123456"]) assert.equal(normalizePhone(bad), null, bad);
    assert.equal(normalizeArgentinePhone("4123456"), null);
    const bad = validateContact({ name: "Ana Pérez", phone: "123", terms: true });
    assert.ok(!bad.ok && bad.errors.phone);
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
  const isPublished = (e: EditionRecord) => !e.deletedAt && (PUBLISHED_STATUSES as readonly string[]).includes(e.status);
  const occupiesDates = (e: EditionRecord) => isPublished(e) && !e.isTest && ["SCHEDULED", "ACTIVE", "PAUSED"].includes(e.status);
  const strip = (p: MemoryParticipant): ParticipantRecord => ({
    id: p.id,
    instagram: p.instagram,
    ipHash: p.ipHash,
    duplicateAttempts: p.duplicateAttempts,
    lastDuplicateAt: p.lastDuplicateAt,
    createdAt: p.createdAt,
    fullName: p.fullName,
    phone: p.phone,
    contactUpdatedAt: p.contactUpdatedAt,
  });
  const toClaim = (c: MemoryClaim): ClaimRecord => {
    const e = editions.find((x) => x.id === c.editionId)!;
    const p = people.find((x) => x.id === c.participantId)!;
    return {
      ...c,
      editionNumber: e.number,
      editionName: e.name,
      prize: e.prize,
      prizeDescription: e.prizeDescription,
      prizeImageUrl: e.prizeImageUrl,
      isTest: e.isTest,
      instagram: p.instagram,
      current: { name: p.fullName, phone: p.phone, updatedAt: p.contactUpdatedAt },
    };
  };
  const conflictFor = (range: { startsAt: Date; endsAt: Date }, excludeId: string | null) =>
    editions.find((e) => e.id !== excludeId && occupiesDates(e) && overlaps(e, range)) ?? null;
  const nextNumber = (isTest: boolean) => editions.filter((e) => e.isTest === isTest).length + 1;
  /** Participantes válidos: misma regla que el ranking (terminada, no rechazada, sin descalificar). */
  const validOf = (editionId: string) =>
    new Set(games.filter((g) => g.editionId === editionId && g.status === "FINISHED" && g.review !== "REJECTED" && !disqualified.has(`${editionId}:${g.participantId}`)).map((g) => g.participantId)).size;
  const unused = async (): Promise<never> => {
    throw new Error("no usado en estos tests");
  };
  const repo: ChallengeRepository = {
    publicTournaments: async (now) => {
      const real = editions.filter((e) => isPublished(e) && !e.isTest);
      const open = real.filter((e) => ["SCHEDULED", "ACTIVE", "PAUSED"].includes(e.status));
      const live = open.filter((e) => e.startsAt <= now && e.endsAt >= now).sort((a, b) => +b.startsAt - +a.startsAt)[0] ?? null;
      const lastEnded = real.filter((e) => e.endsAt < now || ["FINISHED", "RESULTS_PUBLISHED"].includes(e.status)).sort((a, b) => +b.endsAt - +a.endsAt)[0] ?? null;
      const next = open.filter((e) => e.startsAt > now).sort((a, b) => +a.startsAt - +b.startsAt)[0] ?? null;
      const legacy = editions.filter((e) => isPublished(e) && e.isTest).sort((a, b) => +b.startsAt - +a.startsAt)[0] ?? null;
      return { live, lastEnded, next, legacy };
    },
    getEdition: async (id) => editions.find((e) => e.id === id) ?? null,
    listEditions: async () =>
      editions.map((e) => {
        const own = games.filter((g) => g.editionId === e.id);
        return { ...e, games: own.length, participants: new Set(own.map((g) => g.participantId)).size, validParticipants: validOf(e.id) };
      }),
    createEdition: async (data): Promise<SaveResult> => {
      const e = edition({ ...data, minParticipants: data.minParticipants ?? 2, isTest: false, id: `t${editions.length + 1}`, number: nextNumber(false), status: "DRAFT" });
      editions.push(e);
      actions.push("CREATE_DRAFT");
      return { ok: true, edition: e };
    },
    updateEdition: async (id, data, changes): Promise<SaveResult> => {
      const e = editions.find((x) => x.id === id);
      if (!e) return { ok: false, conflict: null };
      if (occupiesDates(e)) {
        const conflict = conflictFor(data, id);
        if (conflict) return { ok: false, conflict: { id: conflict.id, name: conflict.name } };
      }
      Object.assign(e, { ...data, minParticipants: e.status === "DRAFT" ? (data.minParticipants ?? e.minParticipants) : e.minParticipants, isTest: e.isTest });
      actions.push(`UPDATE:${changes.join(",")}`);
      return { ok: true, edition: e };
    },
    publishEdition: async (id): Promise<SaveResult> => {
      const e = editions.find((x) => x.id === id);
      if (!e || e.deletedAt || e.isTest || (e.status !== "DRAFT" && e.status !== "UNPUBLISHED")) return { ok: false, conflict: null };
      const conflict = conflictFor(e, id);
      if (conflict) return { ok: false, conflict: { id: conflict.id, name: conflict.name } };
      e.status = "SCHEDULED";
      actions.push("PUBLISH");
      return { ok: true, edition: e };
    },
    unpublishEdition: async (id) => {
      const e = editions.find((x) => x.id === id);
      if (!e || e.deletedAt || !["SCHEDULED", "ACTIVE", "PAUSED"].includes(e.status)) return null;
      e.status = "UNPUBLISHED";
      actions.push("UNPUBLISH");
      return e;
    },
    finishEdition: async (id, now) => {
      const e = editions.find((x) => x.id === id);
      if (!e || e.deletedAt || !["SCHEDULED", "ACTIVE", "PAUSED"].includes(e.status) || e.startsAt >= now) return null;
      Object.assign(e, { status: "FINISHED", endsAt: e.endsAt > now ? now : e.endsAt });
      actions.push("FINISH");
      return e;
    },
    deletionInfo: async (id) => {
      const e = editions.find((x) => x.id === id);
      if (!e) return null;
      const own = games.filter((g) => g.editionId === id);
      const claim = claims.find((c) => c.editionId === id) ?? null;
      const invitesCount = invites.filter((i) => i.editionId === id).length;
      const referralsCount = referrals.filter((r) => r.editionId === id).length;
      const active = own.length + invitesCount + referralsCount > 0 || claim !== null || e.winnerParticipantId !== null;
      return {
        participants: new Set(own.map((g) => g.participantId)).size,
        games: own.length,
        invites: invitesCount,
        referrals: referralsCount,
        winnerPublished: e.status === "RESULTS_PUBLISHED",
        claimStatus: claim?.status ?? null,
        mode: active ? "soft" : "hard",
      };
    },
    deleteEdition: async (id, reason) => {
      const e = editions.find((x) => x.id === id);
      if (!e || e.deletedAt) return null;
      const info = (await repo.deletionInfo(id))!;
      if (info.mode === "hard") {
        editions.splice(editions.indexOf(e), 1);
        return { mode: "hard" };
      }
      Object.assign(e, { deletedAt: new Date(), deleteReason: reason });
      actions.push("DELETE");
      return { mode: "soft" };
    },
    cancelEdition: async (id, reason) => {
      const e = editions.find((x) => x.id === id);
      if (!e || e.status === "CANCELLED" || e.status === "RESULTS_PUBLISHED") return null;
      Object.assign(e, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason });
      actions.push("CANCEL");
      return e;
    },
    pendingWinnerEditions: async (now) =>
      editions.filter((e) => !e.deletedAt && !e.isTest && (e.status === "FINISHED" || (["SCHEDULED", "ACTIVE", "PAUSED"].includes(e.status) && e.endsAt < now))),
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
        fullName: d.contact.name,
        phone: d.contact.phone,
        contactUpdatedAt: d.now,
        tokenHash: d.tokenHash,
        recoveryCodeHash: null,
        recoveryExpiresAt: null,
      };
      people.push(p);
      return strip(p);
    },
    updateContact: async (id, contact, now) => {
      const p = people.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, { fullName: contact.name, phone: contact.phone, contactUpdatedAt: now });
      for (const c of claims.filter((x) => x.participantId === id && x.status === "PENDING")) Object.assign(c, { status: "CLAIMED", ...contact, claimedAt: now });
      return strip(p);
    },
    eraseContact: async (id) => {
      const p = people.find((x) => x.id === id);
      if (!p) return false;
      Object.assign(p, { fullName: null, phone: null });
      for (const c of claims.filter((x) => x.participantId === id)) Object.assign(c, { name: null, phone: null });
      return true;
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
    claimsOf: async (pid) =>
      claims
        .filter((c) => c.participantId === pid)
        .filter((c) => {
          const e = editions.find((x) => x.id === c.editionId);
          return e && !e.isTest && !e.deletedAt;
        })
        .map(toClaim),
    submitClaim: async (editionId, pid, data, now) => {
      const c = claims.find((x) => x.editionId === editionId && x.participantId === pid && x.status === "PENDING");
      if (!c) return null;
      Object.assign(c, { status: "CLAIMED", ...data, claimedAt: now });
      const p = people.find((x) => x.id === pid)!;
      if (!p.fullName || !p.phone) Object.assign(p, { fullName: data.name, phone: data.phone, contactUpdatedAt: now });
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
      return { participants: new Set(own.map((g) => g.participantId)).size, validParticipants: validOf(editionId), games: own.length, finished: own.filter((g) => g.status === "FINISHED").length, pendingReview: 0 };
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
      if (!e || e.deletedAt || e.isTest || !["SCHEDULED", "ACTIVE", "PAUSED", "FINISHED"].includes(e.status)) return null;
      Object.assign(e, { status: "RESULTS_PUBLISHED", winnerParticipantId: winner?.participantId ?? null, winnerGameId: winner?.gameId ?? null, winnerScore: winner?.score ?? null });
      if (winner) {
        const p = people.find((x) => x.id === winner.participantId)!;
        const ready = Boolean(p.fullName && p.phone);
        claims.push({
          editionId,
          participantId: winner.participantId,
          gameId: winner.gameId,
          status: ready ? "CLAIMED" : "PENDING",
          name: ready ? p.fullName : null,
          phone: ready ? p.phone : null,
          claimedAt: ready ? new Date() : null,
          contactedAt: null,
          deliveredAt: null,
        });
      }
      return e;
    },
  };
  return { repo, editions, people, actions, games, invites, visits, referrals, claims, disqualified };
}

const ORIGIN = "https://sweetcookies-seven.vercel.app";
const IP_SECRET = "clave-de-prueba-para-el-hmac-de-ip!!";

function setup() {
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
    config: { ipSecret: IP_SECRET, trustProxy: "fly" },
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
    const res = await call("/api/challenge/register", { method: "POST", body: { instagram: handle, ...CONTACT, terms: true }, ip });
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
  /** Crea un torneo desde el "panel" (siempre borrador) y, si se pide, lo PUBLICA (paso aparte). */
  const create = async (over: Record<string, unknown> = {}, publish = true) => {
    const res = await call("/api/admin/challenge/editions", { method: "POST", body: { ...form(), ...over } });
    const created = { status: res.status, data: await json(res) };
    if (!publish || res.status !== 201) return created;
    const published = await call(`/api/admin/challenge/editions/${created.data.id}/schedule`, { method: "POST" });
    return { status: published.status === 200 ? 201 : published.status, data: { ...(await json(published)), id: created.data.id } };
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

  it("rechaza fechas inválidas y no publica un torneo que ya terminó", async () => {
    const { create } = setup();
    assert.equal((await create({ endDate: "2026-10-29" })).status, 422);
    const ended = await create({ startDate: "2026-10-01", endDate: "2026-10-02" });
    assert.equal(ended.status, 409);
    assert.equal(ended.data.error, "ended");
  });

  it("crear NO publica; no hay modo prueba ni bloqueo por CHALLENGE_MODE: todo torneo nuevo es real y se publica desde el panel", async () => {
    const { call, create } = setup();
    const draft = await create({ mode: "test" }, false);
    assert.equal(draft.status, 201);
    assert.equal(draft.data.status, "DRAFT");
    assert.equal(draft.data.isTest, false);
    assert.equal(draft.data.published, false);
    assert.equal((await json(await call("/api/public/challenge"))).tournament, null);
    // Aunque el cuerpo pida "schedule", crear sigue siendo borrador.
    const sneaky = await json(await call("/api/admin/challenge/editions", { method: "POST", body: { ...form({ name: "Otro", startDate: "2026-11-05", endDate: "2026-11-06" }), schedule: true } }));
    assert.equal(sneaky.status, "DRAFT");
    const published = await json(await call(`/api/admin/challenge/editions/${draft.data.id}/publish-tournament`, { method: "POST" }));
    assert.equal(published.status, "SCHEDULED");
    assert.equal(published.published, true);
    assert.equal((await json(await call("/api/public/challenge"))).tournament.isTest, false);
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

  it("compatibilidad: la edición semanal anterior (estado ACTIVE guardado) se conserva como histórico de prueba", async () => {
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
    // El histórico NO bloquea fechas: se puede publicar un torneo real superpuesto, y ese tiene prioridad.
    setClock("2026-10-22T18:00:00Z");
    const created = await json(await call("/api/admin/challenge/editions", { method: "POST", body: form({ startDate: "2026-10-22", startTime: "10:00", endDate: "2026-10-27" }) }));
    assert.equal((await call(`/api/admin/challenge/editions/${created.id}/schedule`, { method: "POST" })).status, 200);
    const now = await json(await call("/api/public/challenge"));
    assert.equal(now.tournament.id, created.id);
    assert.equal(now.tournament.isTest, false);
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

  it("ganador confirmado: el premio nace con el nombre y el WhatsApp del registro (no se piden de nuevo); nada privado en lo público", async () => {
    const { call, create, join, play, setClock } = setup();
    const t = await create(runningNow({ prize: "Caja de 6 cookies" }));
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
    assert.equal(me.claims[0].status, "CLAIMED");
    assert.equal(me.claims[0].isTest, false);
    // Nadie más puede reclamar, y el ganador no tiene que volver a dejar datos (sin reclamos duplicados).
    assert.equal((await call(`/api/challenge/claims/${t.data.id}`, { method: "POST", token: other, body: { name: "Intruso Malo", phone: "358 400-0000" } })).status, 403);
    assert.equal((await call(`/api/challenge/claims/${t.data.id}`, { method: "POST", token: winner, body: CONTACT })).status, 409);

    // DATOS DEL GANADOR: solo en el panel.
    const detail = await json(await call(`/api/admin/challenge/editions/${t.data.id}`));
    assert.deepEqual([detail.claim.instagram, detail.claim.name, detail.claim.phone, detail.claim.status], ["ganadora", "Ana Pérez", "5493584123456", "CLAIMED"]);
    assert.equal(detail.claim.current.phone, "5493584123456");

    const info = await json(await call("/api/public/challenge"));
    assert.equal(info.tournament.status, "RESULTS_PUBLISHED");
    assert.equal(info.winner.handle, "@ganadora");
    const text = JSON.stringify(info) + JSON.stringify(await json(await call(`/api/public/challenge?torneo=${t.data.id}`)));
    assert.ok(!text.includes("5493584123456") && !text.includes("4123456") && !text.includes("Pérez") && !text.includes("participantId") && !text.includes("181.10"), text);
    // Su propia sesión ve su nombre, pero nunca el número entero.
    const own = JSON.stringify(await json(await call("/api/challenge/me", { token: winner })));
    assert.ok(!own.includes("4123456") && !own.includes("participantId"), own);
  });

  it("ganador histórico sin datos: se le piden al reclamar (una sola vez) o al completar sus datos; no se inventa nada", async () => {
    const { call, create, join, play, setClock, memory } = setup();
    const t = await create(runningNow());
    const token = await join("@viejo");
    await play(token, humanTaps(60));
    await play(await join("@segundo"), humanTaps(20)); // mínimo por defecto: 2 participantes válidos
    // Participante anterior al requisito: sin nombre ni WhatsApp.
    Object.assign(memory.people[0], { fullName: null, phone: null });
    setClock("2026-10-30T12:00:00Z");
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}/publish`, { method: "POST", body: {} })).status, 200);
    const detail = await json(await call(`/api/admin/challenge/editions/${t.data.id}`));
    assert.deepEqual([detail.claim.status, detail.claim.name, detail.claim.phone, detail.claim.current.phone], ["PENDING", null, null, null]);
    assert.equal((await json(await call("/api/challenge/me", { token }))).participant.contact.complete, false);
    // Completa sus datos: el premio pendiente los toma; no hace falta reclamar aparte.
    assert.equal((await call("/api/challenge/contact", { method: "POST", token, body: { name: "Beto Gómez", phone: "+54 9 358 400 1111", terms: true } })).status, 200);
    const after = await json(await call(`/api/admin/challenge/editions/${t.data.id}`));
    assert.deepEqual([after.claim.status, after.claim.name, after.claim.phone], ["CLAIMED", "Beto Gómez", "5493584001111"]);
    assert.equal((await call(`/api/challenge/claims/${t.data.id}`, { method: "POST", token, body: { name: "Beto Gómez", phone: "358 400-1111" } })).status, 409);
    assert.equal(memory.claims.length, 1);
  });

  it("histórico de prueba: no se reactiva, no tiene ganador con premio ni reclamos", async () => {
    const { call, memory, setClock } = setup();
    memory.editions.push(edition({ id: "legacy", isTest: true, status: "PAUSED", startsAt: new Date("2026-10-19T03:00:00Z"), endsAt: new Date("2026-10-24T02:59:59.999Z") }));
    setClock("2026-10-22T18:00:00Z");
    assert.equal((await json(await call("/api/admin/challenge/editions/legacy/resume", { method: "POST", body: {} }))).error, "legacy");
    assert.equal((await json(await call("/api/admin/challenge/editions/legacy/schedule", { method: "POST" }))).error, "legacy");
    setClock("2026-10-25T12:00:00Z");
    assert.equal((await json(await call("/api/admin/challenge/editions/legacy/publish", { method: "POST", body: {} }))).error, "legacy");
    assert.equal(memory.editions[0].status, "PAUSED");
  });
});

describe("sesión, IP y recuperación (sin cambios de reglas)", () => {
  it("el mismo @ desde otro navegador no obtiene otra sesión; con sesión no se cambia de @", async () => {
    const { call, join, memory } = setup();
    const token = await join("@ana");
    const again = await call("/api/challenge/register", { method: "POST", body: { instagram: "@ANA", ...CONTACT, terms: true } });
    assert.equal(again.status, 409);
    assert.equal(memory.people[0].duplicateAttempts, 1);
    assert.equal((await call("/api/challenge/register", { method: "POST", token, body: { instagram: "@otra", ...CONTACT, terms: true } })).status, 409);
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
    const register = (handle: string, ip: string) => call("/api/challenge/register", { method: "POST", ip, body: { instagram: handle, ...CONTACT, terms: true, ref: code } });
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
    const beto = (await json(await call("/api/challenge/register", { method: "POST", ip: "190.1.1.1", body: { instagram: "@beto", ...CONTACT, terms: true, ref: code } }))).token;
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
    await call("/api/challenge/register", { method: "POST", ip: "190.1.1.1", body: { instagram: "@beto", ...CONTACT, terms: true, ref: code } });
    assert.equal(memory.referrals.length, 0);
  });
});

describe("publicación y ciclo de vida de los torneos", () => {
  it("despublicar: se oculta, no acepta partidas, conserva los datos y se puede volver a publicar", async () => {
    const { call, create, join, play } = setup();
    const t = await create(runningNow());
    const token = await join("@ana");
    await play(token, humanTaps(25));
    const off = await json(await call(`/api/admin/challenge/editions/${t.data.id}/unpublish`, { method: "POST", body: { reason: "Ajustes" } }));
    assert.equal(off.status, "UNPUBLISHED");
    assert.equal(off.published, false);
    assert.equal((await json(await call("/api/public/challenge"))).tournament, null);
    assert.equal((await json(await call(`/api/public/challenge?torneo=${t.data.id}`))).linkStatus, "invalid");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
    const back = await json(await call(`/api/admin/challenge/editions/${t.data.id}/publish-tournament`, { method: "POST" }));
    assert.equal(back.status, "ACTIVE");
    const board = await json(await call("/api/public/challenge"));
    assert.deepEqual(board.leaderboard.map((r: { handle: string; score: number }) => [r.handle, r.score]), [["@ana", 25]]);
  });

  it("un despublicado no bloquea fechas", async () => {
    const { call, create } = setup();
    const a = await create(runningNow({ name: "Torneo A" }));
    await call(`/api/admin/challenge/editions/${a.data.id}/unpublish`, { method: "POST", body: {} });
    assert.equal((await create(runningNow({ name: "Torneo B" }))).status, 201);
    // Y A ya no se puede volver a publicar encima de B.
    assert.equal((await json(await call(`/api/admin/challenge/editions/${a.data.id}/schedule`, { method: "POST" }))).error, "overlap");
  });

  it("pausar y reanudar", async () => {
    const { call, create, join } = setup();
    const t = await create(runningNow());
    const token = await join("@ana");
    assert.equal((await json(await call(`/api/admin/challenge/editions/${t.data.id}/pause`, { method: "POST", body: { reason: "Revisión" } }))).status, "PAUSED");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
    assert.equal((await json(await call(`/api/admin/challenge/editions/${t.data.id}/resume`, { method: "POST", body: {} }))).status, "ACTIVE");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 201);
  });

  it("finalizar ahora: no acepta más partidas y permite confirmar el ganador; uno no empezado no se finaliza", async () => {
    const { call, create, join, play } = setup();
    const future = await create({ name: "Futuro", startDate: "2026-11-05", endDate: "2026-11-06" });
    assert.equal((await json(await call(`/api/admin/challenge/editions/${future.data.id}/finish`, { method: "POST", body: {} }))).error, "not_started");
    const t = await create(runningNow());
    const token = await join("@ana");
    await play(token, humanTaps(40));
    await play(await join("@beto"), humanTaps(20));
    const done = await json(await call(`/api/admin/challenge/editions/${t.data.id}/finish`, { method: "POST", body: { reason: "Cierre anticipado" } }));
    assert.equal(done.status, "FINISHED");
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
    assert.equal((await json(await call("/api/admin/challenge/overview"))).pendingWinners, 1);
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}/publish`, { method: "POST", body: {} })).status, 200);
    assert.equal((await json(await call("/api/challenge/me", { token }))).claims.length, 1);
  });

  it("eliminar sin actividad: definitivo; exige escribir ELIMINAR", async () => {
    const { call, create, memory } = setup();
    const t = await create({}, false);
    assert.equal((await json(await call(`/api/admin/challenge/editions/${t.data.id}/deletion`))).mode, "hard");
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}`, { method: "DELETE", body: { confirm: "eliminar" } })).status, 422);
    const res = await json(await call(`/api/admin/challenge/editions/${t.data.id}`, { method: "DELETE", body: { confirm: "ELIMINAR" } }));
    assert.equal(res.mode, "hard");
    assert.equal(memory.editions.length, 0);
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}`)).status, 404);
  });

  it("eliminar con actividad: lógico; conserva el historial, sale de la página, no bloquea fechas ni habilita partidas o reclamos", async () => {
    const { call, create, join, play, memory, setClock } = setup();
    const t = await create(runningNow());
    const token = await join("@ana");
    await play(token, humanTaps(30));
    await play(await join("@beto"), humanTaps(20));
    setClock("2026-10-30T12:00:00Z");
    await call(`/api/admin/challenge/editions/${t.data.id}/publish`, { method: "POST", body: {} });
    const info = await json(await call(`/api/admin/challenge/editions/${t.data.id}/deletion`));
    assert.deepEqual([info.mode, info.participants, info.games, info.winnerPublished, info.claimStatus], ["soft", 2, 2, true, "CLAIMED"]);
    const res = await json(await call(`/api/admin/challenge/editions/${t.data.id}`, { method: "DELETE", body: { confirm: "ELIMINAR", reason: "Limpieza" } }));
    assert.equal(res.mode, "soft");
    // Se conserva: el torneo y su partida siguen en la base.
    assert.equal(memory.editions.length, 1);
    assert.ok(memory.editions[0].deletedAt);
    assert.equal(memory.games.length, 2);
    // No se ve, no permite reclamar y no se puede volver a eliminar ni editar.
    assert.equal((await json(await call("/api/public/challenge"))).tournament, null);
    assert.deepEqual((await json(await call("/api/challenge/me", { token }))).claims, []);
    assert.equal((await call(`/api/challenge/claims/${t.data.id}`, { method: "POST", token, body: { name: "Ana Pérez", phone: "358 412-3456" } })).status, 403);
    assert.equal((await call(`/api/admin/challenge/editions/${t.data.id}`, { method: "DELETE", body: { confirm: "ELIMINAR" } })).status, 404);
    // Las mismas fechas quedan libres para otro torneo.
    setClock("2026-10-28T15:00:00Z");
    assert.equal((await create(runningNow({ name: "Nuevo" }))).status, 201);
    const list = await json(await call("/api/admin/challenge/editions"));
    assert.equal(list.editions.find((e: { id: string }) => e.id === t.data.id).deletedAt !== null, true);
  });

  it("el histórico de prueba se puede eliminar (lógico, conserva sus resultados)", async () => {
    const { call, memory, setClock } = setup();
    memory.editions.push(edition({ id: "legacy", isTest: true, status: "PAUSED", startsAt: new Date("2026-10-19T03:00:00Z"), endsAt: new Date("2026-10-24T02:59:59.999Z") }));
    const token = (await json(await call("/api/challenge/register", { method: "POST", body: { instagram: "@viejo", ...CONTACT, terms: true } }))).token;
    memory.games.push({ ...memory.games[0], id: "g-old", editionId: "legacy", participantId: "p1", attemptNumber: 1, status: "FINISHED", startedAt: new Date("2026-10-20T12:00:00Z"), finishedAt: new Date("2026-10-20T12:00:20Z"), ipHash: null, clientRequestId: null, score: 145, cookies: 4, tapsReceived: 145, tapsIgnored: 0, untrustedTaps: 0, flags: [], suspicion: "NONE", review: "NONE", reviewedAt: null, reviewedBy: null, reviewReason: null } as GameRecord);
    setClock("2026-10-22T18:00:00Z");
    assert.equal((await json(await call("/api/public/challenge"))).tournament.id, "legacy");
    const res = await json(await call("/api/admin/challenge/editions/legacy", { method: "DELETE", body: { confirm: "ELIMINAR" } }));
    assert.equal(res.mode, "soft");
    assert.equal(memory.games.find((g) => g.id === "g-old")?.score, 145);
    assert.equal((await json(await call("/api/public/challenge"))).tournament, null);
    assert.ok(token);
  });
});

describe("registro con nombre y WhatsApp, y datos privados", () => {
  it("registro obligatorio: sin nombre, WhatsApp o aceptación no se crea la participación", async () => {
    const { call, memory } = setup();
    for (const body of [
      { instagram: "@ana", terms: true },
      { instagram: "@ana", name: "Ana", phone: "358 412-3456", terms: true },
      { instagram: "@ana", name: "Ana Pérez", phone: "412", terms: true },
      { instagram: "@ana", ...CONTACT, terms: false },
    ]) {
      const res = await call("/api/challenge/register", { method: "POST", body });
      assert.equal(res.status, 422, JSON.stringify(body));
    }
    assert.equal(memory.people.length, 0);
    const ok = await call("/api/challenge/register", { method: "POST", body: { instagram: "@Ana.Fan", name: "  ana   pérez ", phone: "0358 15 412-3456", terms: true } });
    assert.equal(ok.status, 201);
    const body = await json(ok);
    // Al propio participante solo le vuelve su nombre y los últimos 4 dígitos.
    assert.deepEqual(body.participant, { handle: "@ana.fan", contact: { complete: true, name: "ana pérez", phoneHint: "•••• 3456" } });
    assert.equal(memory.people[0].phone, "5493584123456");
    assert.ok(!JSON.stringify(body).includes("5493584123456"));
  });

  it("reingreso: con los datos completos no se piden; un participante anterior sin datos no juega hasta dejarlos y conserva intentos y puntaje", async () => {
    const { call, create, join, play, memory } = setup();
    await create(runningNow({ attempts: 3 }));
    const token = await join("@ana");
    assert.equal((await play(token, humanTaps(40))).status, 200);
    assert.equal((await json(await call("/api/challenge/me", { token }))).participant.contact.complete, true);
    // Participante histórico (sin nombre ni WhatsApp): no puede reservar un intento.
    Object.assign(memory.people[0], { fullName: null, phone: null });
    const me = await json(await call("/api/challenge/me", { token }));
    assert.deepEqual(me.participant.contact, { complete: false, name: null, phoneHint: null });
    assert.equal(me.attempts.used, 1);
    const blocked = await call("/api/challenge/games", { method: "POST", token });
    assert.equal(blocked.status, 409);
    assert.equal((await json(blocked)).error, "contact_required");
    assert.equal(memory.games.length, 1);
    // Los deja y sigue con sus intentos y su mejor marca intactos.
    assert.equal((await call("/api/challenge/contact", { method: "POST", token, body: { name: "Ana Pérez", phone: "+1 415 555 0100", terms: true } })).status, 200);
    const again = await json(await call("/api/challenge/me", { token }));
    assert.deepEqual([again.attempts.used, again.attempts.left, again.best.score], [1, 2, 40]);
    assert.equal(memory.people[0].phone, "14155550100");
    assert.equal((await play(token, humanTaps(20))).status, 200);
  });

  it("actualización segura: solo con la propia sesión, validada y con aceptación; no cambia el @ ni los intentos", async () => {
    const { call, create, join, play, memory } = setup();
    await create(runningNow());
    const ana = await join("@ana");
    const beto = await join("@beto");
    await play(ana, humanTaps(30));
    assert.equal((await call("/api/challenge/contact", { method: "POST", body: { name: "Intruso Malo", phone: "358 400-0000", terms: true } })).status, 401);
    assert.equal((await call("/api/challenge/contact", { method: "POST", token: "x".repeat(43), body: { name: "Intruso Malo", phone: "358 400-0000", terms: true } })).status, 401);
    assert.equal((await call("/api/challenge/contact", { method: "POST", token: ana, body: { name: "Ana", phone: "1", terms: true } })).status, 422);
    assert.equal((await call("/api/challenge/contact", { method: "POST", token: ana, body: { name: "Ana López", phone: "358 499-1234" } })).status, 422);
    const res = await call("/api/challenge/contact", { method: "POST", token: ana, body: { name: "Ana López", phone: "358 499-1234", terms: true, instagram: "@otra" } });
    assert.equal(res.status, 200);
    assert.deepEqual((await json(res)).participant, { handle: "@ana", contact: { complete: true, name: "Ana López", phoneHint: "•••• 1234" } });
    // Beto no se tocó; Ana conserva su @ y su partida.
    assert.deepEqual([memory.people[0].instagram, memory.people[0].phone, memory.people[1].phone], ["ana", "5493584991234", "5493584123456"]);
    assert.equal((await json(await call("/api/challenge/me", { token: ana }))).attempts.used, 1);
    assert.ok(beto);
  });

  it("ranking, enlaces y API pública sin datos personales; el panel los ve y puede borrarlos a pedido", async () => {
    const { call, create, join, play, memory } = setup();
    const t = await create(runningNow());
    const token = await join("@ana");
    await play(token, humanTaps(30));
    const invite = await json(await call("/api/challenge/invites", { method: "POST", token }));
    const publicText = [
      JSON.stringify(await json(await call("/api/public/challenge"))),
      JSON.stringify(await json(await call(`/api/public/challenge?torneo=${t.data.id}`))),
      JSON.stringify(invite),
    ].join("");
    assert.ok(!publicText.includes("4123456") && !publicText.includes("Pérez") && !publicText.includes("phone"), publicText);
    assert.ok(!JSON.stringify(await json(await call("/api/challenge/me", { token }))).includes("4123456"));
    // El panel: el listado de participantes muestra si tiene los datos, sin el número.
    const admin = await json(await call(`/api/admin/challenge/editions/${t.data.id}`));
    assert.equal(admin.edition.name, "Desafío Halloween");
    const erased = await call(`/api/admin/challenge/participants/${memory.people[0].id}/erase-contact`, { method: "POST", body: { reason: "Lo pidió por Instagram" } });
    assert.equal(erased.status, 200);
    assert.deepEqual([memory.people[0].fullName, memory.people[0].phone], [null, null]);
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 409);
    assert.equal(memory.games.length, 1);
  });

  it("mismo @ con otros datos desde otro navegador: no crea otra participación ni cambia los datos", async () => {
    const { call, join, memory } = setup();
    await join("@ana");
    const res = await call("/api/challenge/register", { method: "POST", body: { instagram: "@ana", name: "Otra Persona", phone: "11 5555-0000", terms: true } });
    assert.equal(res.status, 409);
    assert.equal(memory.people.length, 1);
    assert.equal(memory.people[0].phone, "5493584123456");
  });
});

describe("foto del premio y enlace público del torneo", () => {
  it("foto opcional: solo imágenes subidas desde el panel; se puede cambiar y quitar; se ve en lo público", async () => {
    const { call, create } = setup();
    const bad = await call("/api/admin/challenge/editions", { method: "POST", body: { ...form(), prizeImageUrl: "https://otro.sitio/premio.jpg" } });
    assert.equal(bad.status, 422);
    assert.ok((await json(bad)).fields.prizeImage);
    const t = await create(runningNow({ prizeImageUrl: "/api/public/images/abcdefghijkl" }));
    assert.equal(t.data.prizeImageUrl, "/api/public/images/abcdefghijkl");
    assert.equal((await json(await call("/api/public/challenge"))).tournament.prizeImageUrl, "/api/public/images/abcdefghijkl");
    const body = { ...form(), ...runningNow(), reason: "Cambio de foto" };
    const changed = await json(await call(`/api/admin/challenge/editions/${t.data.id}`, { method: "PUT", body: { ...body, prizeImageUrl: "/api/public/images/mnopqrstuvwx" } }));
    assert.equal(changed.prizeImageUrl, "/api/public/images/mnopqrstuvwx");
    const removed = await json(await call(`/api/admin/challenge/editions/${t.data.id}`, { method: "PUT", body: { ...body, prizeImageUrl: null } }));
    assert.equal(removed.prizeImageUrl, null);
    assert.equal((await json(await call("/api/public/challenge"))).tournament.prizeImageUrl, null);
  });

  it("enlace permanente ?torneo=ID: programado, activo y finalizado se muestran; eliminado avisa; borrador y despublicado no revelan nada", async () => {
    const { call, create, join, play, setClock } = setup();
    const scheduled = await create({ name: "Programado", startDate: "2026-11-05", endDate: "2026-11-06" });
    const scheduledInfo = await json(await call(`/api/public/challenge?torneo=${scheduled.data.id}`));
    assert.deepEqual([scheduledInfo.linkStatus, scheduledInfo.tournament.status, scheduledInfo.tournament.name], ["ok", "SCHEDULED", "Programado"]);

    const active = await create(runningNow({ name: "Activo" }));
    const token = await join("@ana");
    const activeInfo = await json(await call(`/api/public/challenge?torneo=${active.data.id}`));
    assert.deepEqual([activeInfo.linkStatus, activeInfo.tournament.status], ["ok", "ACTIVE"]);
    assert.equal((await play(token, humanTaps(30))).status, 200);

    setClock("2026-10-30T12:00:00Z");
    const finishedInfo = await json(await call(`/api/public/challenge?torneo=${active.data.id}`));
    assert.deepEqual([finishedInfo.linkStatus, finishedInfo.tournament.status, finishedInfo.leaderboard.length], ["ok", "FINISHED", 1]);

    const draft = await create({ name: "Borrador secreto", startDate: "2026-11-10", endDate: "2026-11-11" }, false);
    const draftInfo = await json(await call(`/api/public/challenge?torneo=${draft.data.id}`));
    assert.equal(draftInfo.linkStatus, "invalid");
    assert.ok(!JSON.stringify(draftInfo).includes("Borrador secreto"));

    await call(`/api/admin/challenge/editions/${scheduled.data.id}/unpublish`, { method: "POST", body: {} });
    const hidden = await json(await call(`/api/public/challenge?torneo=${scheduled.data.id}`));
    assert.equal(hidden.linkStatus, "invalid");
    assert.ok(!JSON.stringify(hidden).includes("Programado"));

    await call(`/api/admin/challenge/editions/${active.data.id}`, { method: "DELETE", body: { confirm: "ELIMINAR" } });
    const removed = await json(await call(`/api/public/challenge?torneo=${active.data.id}`));
    assert.equal(removed.linkStatus, "removed");
    assert.ok(!JSON.stringify(removed).includes("Activo"));
  });
});

describe("mínimo de participantes válidos", () => {
  /** n participantes distintos juegan una partida válida cada uno. */
  const players = async (ctx: ReturnType<typeof setup>, n: number, prefix = "p") => {
    const tokens: string[] = [];
    for (let i = 0; i < n; i++) {
      const token = await ctx.join(`@${prefix}${i}`, `190.0.${Math.floor(i / 200)}.${i % 200}`);
      assert.equal((await ctx.play(token, humanTaps(20 + i))).status, 200);
      tokens.push(token);
    }
    return tokens;
  };
  const publishWinner = (ctx: ReturnType<typeof setup>, id: string) => ctx.call(`/api/admin/challenge/editions/${id}/publish`, { method: "POST", body: {} });

  it("se configura entre 2 y 1000; sugerido 2; se muestra en el detalle y en lo público", async () => {
    const ctx = setup();
    for (const bad of [1, 0, 1001, 2.5, "10"]) {
      const res = await ctx.call("/api/admin/challenge/editions", { method: "POST", body: { ...form(), minParticipants: bad } });
      assert.equal(res.status, 422, String(bad));
      assert.ok((await json(res)).fields.minParticipants);
    }
    const byDefault = await ctx.create({}, false);
    assert.equal(byDefault.data.minParticipants, 2);
    const t = await ctx.create(runningNow({ minParticipants: 1000 }));
    assert.equal(t.data.minParticipants, 1000);
    const detail = await json(await ctx.call(`/api/admin/challenge/editions/${t.data.id}`));
    assert.deepEqual(detail.minimum, { required: 1000, valid: 0, reached: false });
    assert.equal((await json(await ctx.call("/api/public/challenge"))).tournament.minParticipants, 1000);
  });

  it("mínimo 10: con 1 y con 9 participantes no hay ganador ni reclamo; con 10 se habilita la confirmación", async () => {
    for (const [n, ok] of [
      [1, false],
      [9, false],
      [10, true],
    ] as const) {
      const ctx = setup();
      const t = await ctx.create(runningNow({ minParticipants: 10 }));
      const tokens = await players(ctx, n);
      ctx.setClock("2026-10-30T12:00:00Z");
      const info = await json(await ctx.call("/api/public/challenge"));
      assert.deepEqual(info.minimum, { required: 10, valid: n, reached: ok });
      const res = await publishWinner(ctx, t.data.id);
      if (ok) {
        assert.equal(res.status, 200);
        assert.equal(ctx.memory.claims.length, 1);
        continue;
      }
      assert.equal(res.status, 409);
      assert.equal((await json(res)).error, "minimum_not_met");
      // Sin ganador ni reclamo; ranking, participantes y partidas se conservan.
      assert.equal(ctx.memory.claims.length, 0);
      const after = await json(await ctx.call("/api/public/challenge"));
      assert.deepEqual([after.tournament.status, after.winner, after.leaderboard.length], ["FINISHED", null, n]);
      assert.deepEqual((await json(await ctx.call("/api/challenge/me", { token: tokens[0] }))).claims, []);
      assert.equal(ctx.memory.games.length, n);
      // No queda como "ganador por confirmar": no requiere tareas del admin.
      assert.equal((await json(await ctx.call("/api/admin/challenge/overview"))).pendingWinners, 0);
    }
  });

  it("cuenta personas, no intentos; no cuentan descalificados, partidas rechazadas ni registros sin partida válida", async () => {
    const ctx = setup();
    const t = await ctx.create(runningNow({ minParticipants: 3, attempts: 20 }));
    const ana = await ctx.join("@ana");
    for (let i = 0; i < 20; i++) assert.equal((await ctx.play(ana, humanTaps(10 + i))).status, 200);
    await ctx.join("@solo.registro");
    // Abandonó la partida: vence sin puntaje.
    const tardio = await ctx.join("@tardio");
    assert.equal((await ctx.call("/api/challenge/games", { method: "POST", token: tardio })).status, 201);
    ctx.memory.games[ctx.memory.games.length - 1].status = "EXPIRED";
    await ctx.play(await ctx.join("@beto"), humanTaps(30));
    await ctx.play(await ctx.join("@carla"), humanTaps(25));
    ctx.memory.games[ctx.memory.games.length - 1].review = "REJECTED";
    await ctx.play(await ctx.join("@dani"), humanTaps(25));
    const daniId = ctx.memory.people.find((p) => p.instagram === "dani")!.id;
    assert.equal((await ctx.call(`/api/admin/challenge/editions/${t.data.id}/disqualify`, { method: "POST", body: { participantId: daniId, reason: "Cuenta duplicada confirmada" } })).status, 200);
    const detail = await json(await ctx.call(`/api/admin/challenge/editions/${t.data.id}`));
    // ana (20 intentos = 1 persona) y beto.
    assert.deepEqual(detail.minimum, { required: 3, valid: 2, reached: false });
    assert.equal(detail.stats.validParticipants, 2);
    assert.equal(detail.stats.participants, 5);
    ctx.setClock("2026-10-30T12:00:00Z");
    assert.equal((await json(await publishWinner(ctx, t.data.id))).error, "minimum_not_met");
    // Rehabilitar a dani (revisión justificada) completa el mínimo.
    assert.equal((await ctx.call(`/api/admin/challenge/editions/${t.data.id}/reinstate`, { method: "POST", body: { participantId: daniId, reason: "Revisado: es otra persona" } })).status, 200);
    assert.equal((await publishWinner(ctx, t.data.id)).status, 200);
    const list = await json(await ctx.call("/api/admin/challenge/editions"));
    assert.deepEqual([list.editions[0].validParticipants, list.editions[0].minimumReached], [3, true]);
  });

  it("el mínimo solo se cambia en borrador: publicado (o despublicado) no se sube ni se baja", async () => {
    const ctx = setup();
    const draft = await ctx.create({ minParticipants: 5 }, false);
    const edited = await json(await ctx.call(`/api/admin/challenge/editions/${draft.data.id}`, { method: "PUT", body: { ...form(), minParticipants: 8 } }));
    assert.equal(edited.minParticipants, 8);
    assert.equal((await ctx.call(`/api/admin/challenge/editions/${draft.data.id}/schedule`, { method: "POST" })).status, 200);
    for (const value of [2, 50]) {
      const res = await ctx.call(`/api/admin/challenge/editions/${draft.data.id}`, { method: "PUT", body: { ...form(), minParticipants: value, reason: "Cambio" } });
      assert.equal(res.status, 409);
      assert.equal((await json(res)).error, "min_locked");
    }
    // Los demás cambios siguen funcionando (con el mismo valor o sin enviarlo).
    assert.equal((await ctx.call(`/api/admin/challenge/editions/${draft.data.id}`, { method: "PUT", body: { ...form({ name: "Otro nombre" }), minParticipants: 8 } })).status, 200);
    assert.equal((await ctx.call(`/api/admin/challenge/editions/${draft.data.id}`, { method: "PUT", body: { ...form({ name: "Otro más" }) } })).status, 200);
    await ctx.call(`/api/admin/challenge/editions/${draft.data.id}/unpublish`, { method: "POST", body: {} });
    assert.equal((await json(await ctx.call(`/api/admin/challenge/editions/${draft.data.id}`, { method: "PUT", body: { ...form(), minParticipants: 3 } }))).error, "min_locked");
    assert.equal(ctx.memory.editions[0].minParticipants, 8);
  });

  it("torneos anteriores (sin mínimo) conservan su comportamiento: un solo participante puede ganar", async () => {
    const ctx = setup();
    ctx.memory.editions.push(edition({ id: "viejo", minParticipants: null, startsAt: new Date("2026-10-28T14:00:00Z"), endsAt: new Date("2026-10-29T02:59:59.999Z") }));
    const token = await ctx.join("@ana");
    await ctx.play(token, humanTaps(40));
    ctx.setClock("2026-10-30T12:00:00Z");
    assert.equal((await json(await ctx.call("/api/public/challenge?torneo=viejo"))).minimum, null);
    assert.equal((await json(await ctx.call("/api/admin/challenge/overview"))).pendingWinners, 1);
    assert.equal((await publishWinner(ctx, "viejo")).status, 200);
    assert.equal(ctx.memory.claims.length, 1);
    assert.equal(ctx.memory.editions[0].minParticipants, null);
  });
});
