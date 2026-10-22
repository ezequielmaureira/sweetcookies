import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import {
  ATTEMPTS_PER_EDITION,
  DuplicateParticipantError,
  GAME_DURATION_MS,
  PRIZE,
  assessGame,
  hashIp,
  normalizeArgentinePhone,
  normalizeInstagram,
  parseFinishInput,
  scoreTaps,
  validateJoin,
  type ChallengeRepository,
  type ClaimRecord,
  type EditionRecord,
  type GameRecord,
  type ParticipantRecord,
  type RankingRow,
  type Tap,
} from "./challenge.ts";
import { registerChallengeRoutes } from "./challenge-routes.ts";
import { cordobaDay, effectiveStatus, nextCordobaMidnight, weekSchedule, weekWindow } from "./challenge-time.ts";
import type { SettingsRepository } from "./repository.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de respuesta en tests
const json = async (res: Response): Promise<Record<string, any>> => (await res.json()) as Record<string, any>;

const DAY = 24 * 60 * 60 * 1000;

/* ---------- Calendario ---------- */

describe("calendario (America/Argentina/Cordoba)", () => {
  it("se compite del lunes 00:00 al viernes 23:59:59.999; sábado revisión; lunes nueva edición", () => {
    // Miércoles 21/10/2026 12:00 en Córdoba.
    const week = weekWindow(new Date("2026-10-21T15:00:00Z"));
    assert.equal(week.weekStart, "2026-10-19");
    assert.equal(week.startsAt.toISOString(), "2026-10-19T03:00:00.000Z");
    assert.equal(week.endsAt.toISOString(), "2026-10-24T02:59:59.999Z");
    const schedule = weekSchedule(week.weekStart);
    assert.equal(schedule.reviewEndsAt.toISOString(), "2026-10-25T02:59:59.999Z"); // sábado 23:59:59.999
    assert.equal(schedule.nextStartsAt.toISOString(), "2026-10-26T03:00:00.000Z"); // lunes 00:00
  });

  it("el domingo sigue siendo la semana que terminó; el lunes empieza otra", () => {
    assert.equal(weekWindow(new Date("2026-10-26T02:59:00Z")).weekStart, "2026-10-19"); // domingo 23:59
    assert.equal(weekWindow(new Date("2026-10-26T03:00:00Z")).weekStart, "2026-10-26"); // lunes 00:00
  });

  it("el día y la medianoche son los de Córdoba, no los de UTC", () => {
    const lateNight = new Date("2026-10-22T02:30:00Z"); // 21/10 23:30 en Córdoba
    assert.equal(cordobaDay(lateNight), "2026-10-21");
    assert.equal(nextCordobaMidnight(lateNight).toISOString(), "2026-10-22T03:00:00.000Z");
  });

  it("estado real: se cierra solo después del viernes y respeta pausa y publicación", () => {
    const week = weekWindow(new Date("2026-10-21T15:00:00Z"));
    const at = (iso: string) => new Date(iso);
    assert.equal(effectiveStatus({ ...week, status: "ACTIVE" }, at("2026-10-21T15:00:00Z")), "ACTIVE");
    assert.equal(effectiveStatus({ ...week, status: "ACTIVE" }, at("2026-10-24T03:00:00Z")), "FINISHED");
    assert.equal(effectiveStatus({ ...week, status: "PAUSED" }, at("2026-10-21T15:00:00Z")), "PAUSED");
    assert.equal(effectiveStatus({ ...week, status: "PAUSED" }, at("2026-10-24T03:00:00Z")), "FINISHED");
    assert.equal(effectiveStatus({ ...week, status: "ACTIVE" }, at("2026-10-19T02:59:00Z")), "SCHEDULED");
    assert.equal(effectiveStatus({ ...week, status: "RESULTS_PUBLISHED" }, at("2026-10-25T15:00:00Z")), "RESULTS_PUBLISHED");
  });
});

/* ---------- Datos ---------- */

describe("normalización de datos", () => {
  it("Instagram sin @, URL ni mayúsculas", () => {
    assert.equal(normalizeInstagram("@Cookie.Fan"), "cookie.fan");
    assert.equal(normalizeInstagram("https://www.instagram.com/cookie_fan/?hl=es"), "cookie_fan");
    assert.equal(normalizeInstagram("con espacio"), null);
    assert.equal(normalizeInstagram("doble..punto"), null);
  });

  it("para competir se pide solo el @ y aceptar las bases", () => {
    assert.equal(validateJoin({ instagram: "@ana" }).ok, false);
    const ok = validateJoin({ instagram: "@Ana", terms: true });
    assert.ok(ok.ok && ok.instagram === "ana");
  });

  it("celular del ganador en cualquier formato habitual", () => {
    for (const raw of ["358 412-3456", "0358 15 412-3456", "+54 9 358 412 3456", "5493584123456", "(0358) 4123456"]) {
      assert.equal(normalizeArgentinePhone(raw), "5493584123456", raw);
    }
    assert.equal(normalizeArgentinePhone("4123456"), null);
  });

  it("la IP se guarda como HMAC (nunca en texto plano) y solo con clave", () => {
    const hashed = hashIp("k".repeat(32), "181.1.2.3");
    assert.ok(hashed && !hashed.includes("181") && hashed.length === 32);
    assert.equal(hashIp("k".repeat(32), "181.1.2.3"), hashed);
    assert.notEqual(hashIp("otra-clave".padEnd(32, "x"), "181.1.2.3"), hashed);
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

  it("ignora toques fuera de la cookie", () => {
    assert.equal(scoreTaps([{ t: 0, x: 50, y: 50 }, { t: 100, x: 2, y: 2 }]).accepted.length, 1);
  });

  it("un ritmo perfecto en el mismo punto se marca para revisión; uno humano no", () => {
    const robot = Array.from({ length: 120 }, (_, i) => ({ t: i * 100, x: 50, y: 50 }));
    const scoredRobot = scoreTaps(robot);
    const flagged = assessGame(robot, scoredRobot.accepted, scoredRobot.ignored, 0);
    assert.equal(flagged.suspicion, "HIGH");
    assert.ok(flagged.flags.includes("TOO_REGULAR") && flagged.flags.includes("SAME_SPOT"));

    const human = humanTaps(120);
    const scoredHuman = scoreTaps(human);
    assert.equal(assessGame(human, scoredHuman.accepted, scoredHuman.ignored, 0).suspicion, "NONE");
  });

  it("rechaza cuerpos mal formados", () => {
    assert.equal(parseFinishInput({ taps: [1, 2] }).ok, false);
    assert.equal(parseFinishInput({ taps: [0, 150, 50] }).ok, false);
    assert.equal(parseFinishInput({ taps: [0.5, 50, 50] }).ok, false);
    assert.equal(parseFinishInput({ taps: [0, 50, 50], untrusted: 0 }).ok, true);
  });
});

/* ---------- Flujo completo (repositorio en memoria) ---------- */

type MemoryParticipant = ParticipantRecord & { tokenHash: string; recoveryCodeHash: string | null; recoveryExpiresAt: Date | null };
type MemoryClaim = Omit<ClaimRecord, "editionNumber" | "isTest">;

function memoryChallenge() {
  const editions: EditionRecord[] = [];
  const people: MemoryParticipant[] = [];
  const games: GameRecord[] = [];
  const claims: MemoryClaim[] = [];
  const disqualified = new Set<string>();
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
    return { ...c, editionNumber: e.number, isTest: e.isTest };
  };
  const unused = async (): Promise<never> => {
    throw new Error("no usado en estos tests");
  };
  const repo: ChallengeRepository = {
    ensureEdition: async ({ isTest, ...w }) => {
      let edition = editions.find((e) => e.weekStart === w.weekStart && e.isTest === isTest);
      if (!edition) {
        edition = {
          id: `e${editions.length + 1}`,
          isTest,
          number: editions.filter((e) => e.isTest === isTest).length + 1,
          ...w,
          status: "ACTIVE",
          gameDurationMs: GAME_DURATION_MS,
          attempts: ATTEMPTS_PER_EDITION,
          prize: PRIZE,
          pausedAt: null,
          pauseReason: null,
          winnerParticipantId: null,
          winnerGameId: null,
          winnerScore: null,
          resultsPublishedAt: null,
        };
        editions.push(edition);
      }
      return edition;
    },
    getEdition: async (id) => editions.find((e) => e.id === id) ?? null,
    listEditions: async () => editions,
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
    stats: async () => ({ participants: 0, games: games.length, finished: 0, pendingReview: 0 }),
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
    setPaused: unused,
    reviewGame: unused,
    disqualify: async (editionId, pid) => {
      if (disqualified.has(`${editionId}:${pid}`)) return false;
      disqualified.add(`${editionId}:${pid}`);
      return true;
    },
    reinstate: async (editionId, pid) => disqualified.delete(`${editionId}:${pid}`),
    publishResults: async (editionId, winner) => {
      const edition = editions.find((e) => e.id === editionId);
      if (!edition || edition.status === "RESULTS_PUBLISHED") return null;
      Object.assign(edition, { status: "RESULTS_PUBLISHED", winnerParticipantId: winner?.participantId ?? null, winnerGameId: winner?.gameId ?? null, winnerScore: winner?.score ?? null });
      if (winner) claims.push({ editionId, participantId: winner.participantId, gameId: winner.gameId, status: "PENDING", name: null, phone: null, claimedAt: null, contactedAt: null, deliveredAt: null });
      return edition;
    },
  };
  return { repo, people };
}

const ORIGIN = "https://sweetcookies-seven.vercel.app";
const IP_SECRET = "clave-de-prueba-para-el-hmac-de-ip!!";

function setup(options: { official?: boolean } = {}) {
  let clock = new Date("2026-10-21T15:00:00Z"); // miércoles 12:00 en Córdoba
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
  // Las rutas admin reales pasan por Clerk antes; acá basta con fijar el usuario.
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
    config: { official: options.official ?? false, ipSecret: IP_SECRET, trustProxy: "fly" },
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
    assert.equal(start.status, 201);
    const { game } = await json(start);
    clock = new Date(clock.getTime() + 17_000);
    return call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, ip, body: { taps: taps.flatMap((t) => [t.t, t.x, t.y]), untrusted: 0 } });
  };
  const advance = (ms: number) => (clock = new Date(clock.getTime() + ms));
  return { call, join, play, advance, memory };
}

describe("campeonato: participación con @ y sesión", () => {
  it("solo con el @: entrega un token propio", async () => {
    const { call, join } = setup();
    const token = await join("@Jugador.Uno");
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const me = await json(await call("/api/challenge/me", { token }));
    assert.equal(me.participant.handle, "@jugador.uno");
    assert.equal(me.attempts.left, 3);
  });

  it("sin token no hay sesión", async () => {
    const { call } = setup();
    assert.equal((await call("/api/challenge/me")).status, 401);
    assert.equal((await call("/api/challenge/games", { method: "POST", token: "x".repeat(43) })).status, 401);
  });

  it("el mismo @ desde otro navegador no obtiene otra sesión ni otros 3 intentos (queda la alerta)", async () => {
    const { call, join, memory } = setup();
    await join("@ana");
    const again = await call("/api/challenge/register", { method: "POST", body: { instagram: "@ANA", terms: true }, ip: "190.0.0.9" });
    assert.equal(again.status, 409);
    assert.equal((await json(again)).error, "handle_taken");
    assert.equal(memory.people[0].duplicateAttempts, 1);
  });

  it("con una sesión abierta no se puede cambiar de @ para reiniciar los intentos", async () => {
    const { call, join } = setup();
    const token = await join("@ana");
    for (let i = 0; i < 3; i++) assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 201);
    const other = await call("/api/challenge/register", { method: "POST", token, body: { instagram: "@ana.otra", terms: true } });
    assert.equal(other.status, 409);
    assert.equal((await json(other)).error, "already_has_session");
    assert.equal((await json(await call("/api/challenge/me", { token }))).attempts.left, 0);
  });

  it("recuperación manual: código de un solo uso; la sesión anterior deja de valer y conserva los intentos", async () => {
    const { call, join } = setup();
    const oldToken = await join("@ana");
    assert.equal((await call("/api/challenge/games", { method: "POST", token: oldToken })).status, 201);
    const { code } = await json(await call("/api/admin/challenge/participants/p1/recovery", { method: "POST", body: {} }));
    assert.match(code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    assert.equal((await call("/api/challenge/recover", { method: "POST", body: { instagram: "@ana", code: "AAAAA-AAAAA" } })).status, 422);
    const recovered = await call("/api/challenge/recover", { method: "POST", body: { instagram: "@ana", code: code.toLowerCase() } });
    assert.equal(recovered.status, 200);
    const newToken = (await json(recovered)).token as string;
    assert.equal((await call("/api/challenge/me", { token: oldToken })).status, 401);
    assert.equal((await json(await call("/api/challenge/me", { token: newToken }))).attempts.left, 2);
    // Un solo uso.
    assert.equal((await call("/api/challenge/recover", { method: "POST", body: { instagram: "@ana", code } })).status, 422);
  });

  it("IP compartida: dos @ desde la misma conexión pueden jugar; el admin ve la alerta", async () => {
    const { call, join, play } = setup();
    const a = await join("@mama", "200.1.1.1");
    const b = await join("@hijo", "200.1.1.1");
    assert.equal((await play(a, humanTaps(30), "200.1.1.1")).status, 200);
    assert.equal((await play(b, humanTaps(40), "200.1.1.1")).status, 200);
    const detail = await json(await call("/api/admin/challenge/editions/e1"));
    assert.equal(detail.alerts.length, 1);
    assert.deepEqual(detail.alerts[0].participants.map((p: { instagram: string }) => p.instagram).sort(), ["hijo", "mama"]);
    assert.ok(!JSON.stringify(detail.alerts).includes("200.1.1.1"));
  });
});

describe("campeonato: intentos por torneo, puntaje y ranking", () => {
  it("3 intentos por TORNEO: el 4.º se rechaza y no vuelven al día siguiente", async () => {
    const { call, join, advance } = setup();
    const token = await join("@ana");
    for (let i = 0; i < 3; i++) assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 201);
    const fourth = await call("/api/challenge/games", { method: "POST", token });
    assert.equal(fourth.status, 429);
    assert.equal((await json(fourth)).error, "no_attempts");
    advance(DAY); // jueves
    assert.equal((await json(await call("/api/challenge/me", { token }))).attempts.left, 0);
    assert.equal((await call("/api/challenge/games", { method: "POST", token })).status, 429);
  });

  it("el lunes siguiente empieza otro torneo con 3 intentos nuevos y ranking en cero", async () => {
    const { call, join, play, advance } = setup();
    const token = await join("@ana");
    for (let i = 0; i < 3; i++) assert.equal((await play(token, humanTaps(30))).status, 200);
    advance(5 * DAY); // lunes 26/10
    const me = await json(await call("/api/challenge/me", { token }));
    assert.equal(me.edition.number, 2);
    assert.equal(me.attempts.left, 3);
    assert.equal(me.best, null);
    assert.equal((await json(await call("/api/public/challenge"))).leaderboard.length, 0);
  });

  it("el puntaje sale de los toques, no se puede cerrar antes de tiempo ni dos veces", async () => {
    const { call, join, advance } = setup();
    const token = await join("@ana");
    const { game } = await json(await call("/api/challenge/games", { method: "POST", token }));
    const body = { taps: humanTaps(50).flatMap((t) => [t.t, t.x, t.y]), untrusted: 0, score: 9999 };
    assert.equal((await call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, body })).status, 409);
    advance(17_000);
    const first = await json(await call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, body }));
    assert.equal(first.result.score, 50);
    assert.equal(first.result.cookies, 1);
    const repeated = await json(await call(`/api/challenge/games/${game.id}/finish`, { method: "POST", token, body: { taps: [], untrusted: 0 } }));
    assert.equal(repeated.repeated, true);
    assert.equal(repeated.result.score, 50);
  });

  it("ranking: muestra @, mejor partida de cada uno; a igual puntaje gana quien llegó primero; nada privado", async () => {
    const { call, join, play } = setup();
    const a = await join("@primera");
    const b = await join("@segunda");
    await play(a, humanTaps(40));
    const record = await json(await play(a, humanTaps(60)));
    assert.equal(record.result.newRecord, true);
    assert.equal(record.attempts.left, 1);
    await play(b, humanTaps(60));
    const board = await json(await call("/api/public/challenge"));
    assert.deepEqual(
      board.leaderboard.map((r: { handle: string; score: number }) => [r.handle, r.score]),
      [
        ["@primera", 60],
        ["@segunda", 60],
      ],
    );
    const text = JSON.stringify(board);
    assert.ok(!text.includes("181.10") && !text.includes("participantId") && !text.includes('"p1"'));
  });

  it("después del viernes 23:59:59 no se aceptan partidas oficiales", async () => {
    const { call, join, advance } = setup();
    const token = await join("@ana");
    advance(2.5 * DAY); // sábado
    const res = await call("/api/challenge/games", { method: "POST", token });
    assert.equal(res.status, 409);
    assert.equal((await json(res)).status, "FINISHED");
  });

  it("prueba y oficial no se mezclan: cada modo tiene su edición", async () => {
    const test = await json(await setup().call("/api/public/challenge"));
    const official = await json(await setup({ official: true }).call("/api/public/challenge"));
    assert.equal(test.edition.isTest, true);
    assert.equal(official.edition.isTest, false);
  });

  it("CORS restringido para el participante", async () => {
    const { call } = setup();
    const res = await call("/api/challenge/me");
    assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  });
});

describe("campeonato: premio del primer puesto", () => {
  it("solo el ganador confirmado reclama, una sola vez, y su celular nunca es público", async () => {
    const { call, join, play, advance } = setup();
    const winner = await join("@ganadora");
    const other = await join("@segundo");
    await play(winner, humanTaps(80));
    await play(other, humanTaps(50));

    // Antes de publicar no hay premio para nadie.
    assert.deepEqual((await json(await call("/api/challenge/me", { token: winner }))).claims, []);
    assert.equal((await call("/api/challenge/claims/e1", { method: "POST", token: winner, body: { name: "Ana", phone: "358 412-3456" } })).status, 403);

    // Publicar exige la edición cerrada.
    assert.equal((await call("/api/admin/challenge/editions/e1/publish", { method: "POST", body: {} })).status, 409);
    advance(2.5 * DAY); // sábado
    assert.equal((await call("/api/admin/challenge/editions/e1/publish", { method: "POST", body: { reason: "Revisado" } })).status, 200);

    const me = await json(await call("/api/challenge/me", { token: winner }));
    assert.equal(me.claims.length, 1);
    assert.equal(me.claims[0].status, "PENDING");
    assert.equal(me.claims[0].isTest, true);

    // Otro participante no puede reclamarlo, aunque sepa el @ del ganador.
    assert.equal((await call("/api/challenge/claims/e1", { method: "POST", token: other, body: { name: "Intruso", phone: "358 400-0000" } })).status, 403);
    assert.equal((await call("/api/challenge/claims/e1", { method: "POST", token: winner, body: { name: "A", phone: "123" } })).status, 422);
    const claimed = await call("/api/challenge/claims/e1", { method: "POST", token: winner, body: { name: "Ana Pérez", phone: "0358 15 412-3456" } });
    assert.equal(claimed.status, 200);
    assert.equal((await json(claimed)).claim.status, "CLAIMED");
    // Sin reclamos duplicados.
    assert.equal((await call("/api/challenge/claims/e1", { method: "POST", token: winner, body: { name: "Ana Pérez", phone: "358 412-3456" } })).status, 409);

    // El admin ve los datos y avanza el estado.
    const detail = await json(await call("/api/admin/challenge/editions/e1"));
    assert.equal(detail.claim.phone, "5493584123456");
    assert.equal(detail.claim.name, "Ana Pérez");
    assert.equal((await call("/api/admin/challenge/editions/e1/claim", { method: "POST", body: { status: "CONTACTED" } })).status, 200);
    assert.equal((await call("/api/admin/challenge/editions/e1/claim", { method: "POST", body: { status: "DELIVERED" } })).status, 200);
    assert.equal((await call("/api/admin/challenge/editions/e1/claim", { method: "POST", body: { status: "CONTACTED" } })).status, 409);

    // Lo público nunca trae el celular ni el nombre.
    const board = JSON.stringify(await json(await call("/api/public/challenge")));
    assert.ok(board.includes("@ganadora") && !board.includes("5493584123456") && !board.includes("Pérez"));
    const mine = JSON.stringify(await json(await call("/api/challenge/me", { token: winner })));
    assert.ok(!mine.includes("5493584123456"));
  });
});
