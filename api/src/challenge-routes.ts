import type { Context, Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import {
  DuplicateParticipantError,
  FINISH_GRACE_MS,
  RECOVERY_TTL_MS,
  TOP_SIZE,
  assessGame,
  cookiesFor,
  flattenTaps,
  generateRecoveryCode,
  generateToken,
  handleOf,
  hashIp,
  hashRecoveryCode,
  hashToken,
  isTokenShaped,
  normalizeInstagram,
  normalizeRecoveryCode,
  parseFinishInput,
  parseReason,
  publicEdition,
  publicRow,
  scoreTaps,
  validateClaim,
  validateJoin,
  type ChallengeRepository,
  type ClaimRecord,
  type EditionRecord,
  type GameRecord,
  type ParticipantRecord,
  type RankingRow,
} from "./challenge.ts";
import { effectiveStatus, weekWindow } from "./challenge-time.ts";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";
import type { SettingsRepository } from "./repository.ts";

type Variables = { userId: string };
type AppContext = Context<{ Variables: Variables }>;

export type ChallengeConfig = {
  /** false (por defecto) = ediciones de PRUEBA, sin premio real. true solo con CHALLENGE_MODE=official. */
  official: boolean;
  /** Clave del HMAC de IP (CHALLENGE_IP_SECRET). null = no se guarda ningún dato de IP. */
  ipSecret: string | null;
  /**
   * De dónde sale la IP: "fly" = cabecera Fly-Client-IP (la pone el proxy de
   * Fly y el cliente no puede falsificarla); "socket" = conexión directa (local).
   * X-Forwarded-For nunca se usa: cualquiera puede escribirla.
   */
  trustProxy: "fly" | "socket";
};

type Deps = {
  challenge: ChallengeRepository;
  settings: SettingsRepository;
  allowedOrigins: string[];
  log: (message: string) => void;
  config: ChallengeConfig;
  now?: () => Date;
  limiters?: Partial<Record<"register" | "recover" | "start" | "finish" | "claim", RateLimiter>>;
};

const RANKING_CACHE_MS = 10_000;

async function readJson(c: Context): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

const tooLarge = (c: Context) => c.json({ error: "payload_too_large" }, 413);

/**
 * Sweet Click Challenge. Módulo independiente: no toca productos, pedidos,
 * stock ni vouchers. Se registra DESPUÉS del middleware de /api/admin/*, así
 * las rutas admin ya llegan autenticadas (401) y autorizadas (403).
 *
 * - /api/public/challenge: lectura pública (edición vigente + top 10 con @, sin datos privados).
 * - /api/challenge/*: participante (token propio), CORS restringido y límites por IP.
 * - /api/admin/challenge/*: panel (Clerk + ADMIN_EMAILS).
 *
 * Identificación: token aleatorio de sesión + @ normalizado (único) + HMAC de
 * la IP + historial de intentos y alertas. Nada de eso garantiza que sea una
 * persona única: las coincidencias se marcan para revisión, nunca bloquean solas.
 */
export function registerChallengeRoutes(app: Hono<{ Variables: Variables }>, deps: Deps) {
  const { challenge, settings, allowedOrigins, log, config } = deps;
  const now = deps.now ?? (() => new Date());
  const limit = {
    // Holgados a propósito: muchas personas pueden compartir IP (CGNAT de las
    // compañías móviles, Wi-Fi de una familia o escuela). Los 3 intentos ya se
    // limitan por participante; esto solo frena abusos masivos.
    register: deps.limiters?.register ?? createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 }),
    recover: deps.limiters?.recover ?? createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
    start: deps.limiters?.start ?? createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 }),
    finish: deps.limiters?.finish ?? createRateLimiter({ limit: 120, windowMs: 10 * 60 * 1000 }),
    claim: deps.limiters?.claim ?? createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
  };

  /** IP observada por un proxy confiable (o la conexión directa). null = desconocida. */
  const clientIp = (c: Context): string | null => {
    if (config.trustProxy === "fly") return c.req.header("fly-client-ip")?.trim() || null;
    try {
      return getConnInfo(c).remote.address ?? null;
    } catch {
      return null;
    }
  };
  const ipHashOf = (c: Context) => hashIp(config.ipSecret, clientIp(c));
  const allow = (limiter: RateLimiter, c: Context) => limiter.allow(clientIp(c) ?? "unknown");

  // Ranking en memoria por 10 s (se invalida al cerrar cada partida o por una acción del admin).
  const cache = new Map<string, { at: number; rows: RankingRow[] }>();
  const ranking = async (editionId: string, fresh = false) => {
    const hit = cache.get(editionId);
    if (!fresh && hit && Date.now() - hit.at < RANKING_CACHE_MS) return hit.rows;
    const rows = await challenge.ranking(editionId);
    cache.set(editionId, { at: Date.now(), rows });
    return rows;
  };

  /**
   * Edición de la semana actual (se crea sola, sin cron) y su estado real.
   * Prueba u oficial según la configuración: nunca se mezclan.
   * Se recuerda 10 s para no escribir en la base en cada lectura pública; reservar
   * un intento siempre la relee (`fresh`), y las acciones del admin la olvidan.
   */
  let editionCache: { weekStart: string; at: number; edition: EditionRecord } | null = null;
  const current = async (fresh = false) => {
    const t = now();
    const week = weekWindow(t);
    const cached = !fresh && editionCache?.weekStart === week.weekStart && Date.now() - editionCache.at < RANKING_CACHE_MS ? editionCache.edition : null;
    const edition = cached ?? (await challenge.ensureEdition({ ...week, isTest: !config.official }));
    editionCache = { weekStart: week.weekStart, at: cached ? editionCache!.at : Date.now(), edition };
    return { edition, status: effectiveStatus(edition, t), t };
  };
  const forgetEdition = (editionId: string) => {
    cache.delete(editionId);
    editionCache = null;
  };

  const standing = (rows: RankingRow[], participantId: string) => {
    const index = rows.findIndex((r) => r.participantId === participantId);
    return index < 0 ? null : { position: index + 1, score: rows[index].score, cookies: cookiesFor(rows[index].score) };
  };

  /** Intentos oficiales de la edición: 3 por torneo semanal, no por día. */
  const attemptsOf = async (participantId: string, edition: EditionRecord) => {
    const used = await challenge.countAttempts(participantId, edition.id);
    return { limit: edition.attempts, used: Math.min(used, edition.attempts), left: Math.max(0, edition.attempts - used) };
  };

  const participantOf = async (c: Context): Promise<ParticipantRecord | null> => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!isTokenShaped(token)) return null;
    return challenge.findParticipantByTokenHash(hashToken(token), now());
  };

  /** Premio del jugador (sin datos de contacto: esos solo se cargan y se ven en el panel). */
  const publicClaim = (claim: ClaimRecord) => ({
    editionId: claim.editionId,
    editionNumber: claim.editionNumber,
    isTest: claim.isTest,
    status: claim.status,
  });

  /* ---------- Público ---------- */

  app.get("/api/public/challenge", async (c) => {
    const { edition, status, t } = await current();
    const [rows, siteSettings] = await Promise.all([ranking(edition.id), settings.get()]);
    const winner =
      status === "RESULTS_PUBLISHED" && edition.winnerParticipantId
        ? (rows.find((r) => r.participantId === edition.winnerParticipantId) ?? null)
        : null;
    c.header("Cache-Control", "public, max-age=5, s-maxage=5");
    return c.json({
      edition: publicEdition(edition, t, status),
      leaderboard: rows.slice(0, TOP_SIZE).map((row, i) => publicRow(row, i + 1)),
      ranked: rows.length,
      winner: winner ? { handle: handleOf(winner.instagram), score: edition.winnerScore ?? winner.score, cookies: cookiesFor(edition.winnerScore ?? winner.score) } : null,
      instagramHandle: siteSettings.instagramHandle,
    });
  });

  /* ---------- Participante ---------- */

  app.use(
    "/api/challenge/*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );
  app.use("/api/challenge/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  // Participar: solo el @. No se comprueba si sigue la cuenta (no hay forma
  // confiable sin la API de Meta); ese paso lo recuerda el navegador.
  app.post("/api/challenge/register", bodyLimit({ maxSize: 2 * 1024, onError: tooLarge }), async (c) => {
    if (!allow(limit.register, c)) return c.json({ error: "too_many_requests" }, 429);
    // Con una sesión válida no se registra otro @: cambiar de usuario no reinicia los intentos.
    if (await participantOf(c)) return c.json({ error: "already_has_session" }, 409);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateJoin(parsed.body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);

    const token = generateToken();
    try {
      const participant = await challenge.createParticipant({ instagram: result.instagram, tokenHash: hashToken(token), ipHash: ipHashOf(c), now: now() });
      log(`[challenge] participant ${participant.id} joined`);
      // El token se entrega UNA sola vez: la base guarda solo su hash.
      return c.json({ token, participant: { handle: handleOf(participant.instagram) } }, 201);
    } catch (error) {
      if (!(error instanceof DuplicateParticipantError)) throw error;
      // El mismo @ desde otro navegador NO obtiene otra sesión ni otros 3 intentos. Queda como alerta.
      await challenge.noteDuplicate(result.instagram, now());
      log(`[challenge] duplicate join attempt for an existing handle`);
      return c.json(
        {
          error: "handle_taken",
          fields: { instagram: "Este @ ya está participando desde otro celular o navegador. Si es tuyo, escribinos por Instagram y te damos un código para recuperarlo." },
        },
        409,
      );
    }
  });

  // Recuperación manual: el admin genera un código de un solo uso y se lo manda por Instagram.
  app.post("/api/challenge/recover", bodyLimit({ maxSize: 1024, onError: tooLarge }), async (c) => {
    if (!allow(limit.recover, c)) return c.json({ error: "too_many_requests" }, 429);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const body = (parsed.body ?? {}) as Record<string, unknown>;
    const instagram = normalizeInstagram(typeof body.instagram === "string" ? body.instagram : "");
    const code = normalizeRecoveryCode(typeof body.code === "string" ? body.code : "");
    if (!instagram || code.length !== 10) return c.json({ error: "invalid_code" }, 422);
    const token = generateToken();
    const participant = await challenge.recover(instagram, hashRecoveryCode(code), hashToken(token), now());
    if (!participant) return c.json({ error: "invalid_code" }, 422);
    log(`[challenge] participant ${participant.id} recovered a session`);
    return c.json({ token, participant: { handle: handleOf(participant.instagram) } });
  });

  app.get("/api/challenge/me", async (c) => {
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const { edition, status, t } = await current();
    const [rows, attempts, disqualified, claims] = await Promise.all([
      ranking(edition.id),
      attemptsOf(participant.id, edition),
      challenge.isDisqualified(edition.id, participant.id),
      challenge.claimsOf(participant.id),
    ]);
    return c.json({
      participant: { handle: handleOf(participant.instagram) },
      edition: publicEdition(edition, t, status),
      attempts,
      best: standing(rows, participant.id),
      ranked: rows.length,
      disqualified,
      // Solo premios que todavía requieren algo del ganador o están en curso.
      claims: claims.filter((cl) => cl.status !== "DELIVERED").map(publicClaim),
    });
  });

  // Reserva ATÓMICA del intento: el índice único (participante, edición, intento)
  // impide que dos pestañas o pedidos simultáneos superen los 3 del torneo.
  app.post("/api/challenge/games", async (c) => {
    if (!allow(limit.start, c)) return c.json({ error: "too_many_requests" }, 429);
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const { edition, status, t } = await current(true);
    if (status !== "ACTIVE") return c.json({ error: "edition_not_active", status }, 409);
    if (await challenge.isDisqualified(edition.id, participant.id)) return c.json({ error: "disqualified" }, 403);

    const ipHash = ipHashOf(c);
    for (let attempt = 0; attempt < 3; attempt++) {
      const used = await challenge.countAttempts(participant.id, edition.id);
      if (used >= edition.attempts) return c.json({ error: "no_attempts", attempts: await attemptsOf(participant.id, edition) }, 429);
      const game = await challenge.createGame({ editionId: edition.id, participantId: participant.id, attemptNumber: used + 1, startedAt: t, ipHash });
      if (game) {
        return c.json({ game: { id: game.id, durationMs: edition.gameDurationMs, attemptNumber: game.attemptNumber }, attempts: await attemptsOf(participant.id, edition) }, 201);
      }
    }
    return c.json({ error: "attempt_conflict" }, 409);
  });

  /** Resumen del resultado para el jugador (también para un reintento de cierre). */
  const summary = async (game: GameRecord, edition: EditionRecord, before: RankingRow[] | null) => {
    const t = now();
    const rows = await ranking(edition.id, true);
    const mine = standing(rows, game.participantId);
    const previous = before ? standing(before, game.participantId) : null;
    const score = game.score ?? 0;
    return {
      result: {
        score,
        cookies: cookiesFor(score),
        best: mine,
        ranked: rows.length,
        newRecord: before !== null && previous !== null && score > previous.score,
        enteredTop10: before !== null && mine !== null && mine.position <= TOP_SIZE && (previous === null || previous.position > TOP_SIZE),
      },
      attempts: await attemptsOf(game.participantId, edition),
      edition: publicEdition(edition, t, effectiveStatus(edition, t)),
    };
  };

  app.post("/api/challenge/games/:id/finish", bodyLimit({ maxSize: 32 * 1024, onError: tooLarge }), async (c) => {
    if (!allow(limit.finish, c)) return c.json({ error: "too_many_requests" }, 429);
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const game = await challenge.getGame(c.req.param("id") ?? "");
    if (!game || game.participantId !== participant.id) return c.json({ error: "not_found" }, 404);
    const edition = await challenge.getEdition(game.editionId);
    if (!edition) return c.json({ error: "not_found" }, 404);

    // Cierre repetido (la respuesta anterior se perdió en la red): mismo resultado, sin volver a calcular.
    if (game.status === "FINISHED") return c.json({ ...(await summary(game, edition, null)), repeated: true });
    if (game.status === "EXPIRED") return c.json({ error: "expired" }, 409);

    const elapsed = now().getTime() - game.startedAt.getTime();
    // Nadie puede cerrar antes de que pasen los 15 s reales desde que el servidor reservó el intento.
    if (elapsed < edition.gameDurationMs) return c.json({ error: "too_early" }, 409);
    if (elapsed > edition.gameDurationMs + FINISH_GRACE_MS) {
      await challenge.expireGame(game.id);
      return c.json({ error: "expired" }, 409);
    }

    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const input = parseFinishInput(parsed.body, edition.gameDurationMs);
    if (!input.ok) return c.json({ error: "validation_error", fields: { taps: "Toques inválidos." } }, 422);

    // El puntaje lo calcula el servidor: el total que muestre el navegador no se usa.
    const { accepted, ignored } = scoreTaps(input.data.taps, edition.gameDurationMs);
    const { flags, suspicion } = assessGame(input.data.taps, accepted, ignored, input.data.untrusted);
    const before = await ranking(edition.id, true);
    const finished = await challenge.finishGame(game.id, {
      score: accepted.length,
      cookies: cookiesFor(accepted.length),
      tapsReceived: input.data.taps.length,
      tapsIgnored: ignored,
      untrustedTaps: input.data.untrusted,
      taps: flattenTaps(input.data.taps),
      flags,
      suspicion,
      finishedAt: now(),
    });
    if (!finished) {
      // Otro pedido la cerró justo antes: se responde con ese resultado.
      const closed = await challenge.getGame(game.id);
      return closed ? c.json({ ...(await summary(closed, edition, null)), repeated: true }) : c.json({ error: "not_found" }, 404);
    }
    if (suspicion !== "NONE") log(`[challenge] game ${game.id} flagged ${suspicion}: ${flags.join(",")}`);
    return c.json(await summary(finished, edition, before));
  });

  // Reclamo del premio: solo la sesión del ganador confirmado, una sola vez.
  app.post("/api/challenge/claims/:editionId", bodyLimit({ maxSize: 1024, onError: tooLarge }), async (c) => {
    if (!allow(limit.claim, c)) return c.json({ error: "too_many_requests" }, 429);
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const editionId = c.req.param("editionId") ?? "";
    const claim = await challenge.getClaim(editionId);
    if (!claim || claim.participantId !== participant.id) return c.json({ error: "not_winner" }, 403);
    if (claim.status !== "PENDING") return c.json({ error: "already_claimed", claim: publicClaim(claim) }, 409);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const input = validateClaim(parsed.body);
    if (!input.ok) return c.json({ error: "validation_error", fields: input.errors }, 422);
    const saved = await challenge.submitClaim(editionId, participant.id, input.data, now());
    if (!saved) return c.json({ error: "already_claimed" }, 409);
    log(`[challenge] prize claimed for edition ${editionId}`);
    return c.json({ claim: publicClaim(saved) });
  });

  /* ---------- Admin ---------- */

  const adminEdition = (edition: EditionRecord, t: Date) => ({
    ...publicEdition(edition, t, effectiveStatus(edition, t)),
    weekStart: edition.weekStart,
    storedStatus: edition.status,
    pausedAt: edition.pausedAt?.toISOString() ?? null,
    pauseReason: edition.pauseReason,
    winnerParticipantId: edition.winnerParticipantId,
    winnerGameId: edition.winnerGameId,
    winnerScore: edition.winnerScore,
    resultsPublishedAt: edition.resultsPublishedAt?.toISOString() ?? null,
  });

  const editionParam = async (c: Context) => challenge.getEdition(c.req.param("id") ?? "");

  app.get("/api/admin/challenge/current", async (c) => {
    const { edition, t } = await current(true);
    return c.json({ ...adminEdition(edition, t), mode: config.official ? "official" : "test", ipTracking: config.ipSecret !== null });
  });

  app.get("/api/admin/challenge/editions", async (c) => {
    await current();
    const t = now();
    return c.json({ editions: (await challenge.listEditions()).map((e) => adminEdition(e, t)) });
  });

  app.get("/api/admin/challenge/editions/:id", async (c) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const [stats, rankingRows, disqualifications, actions, alerts, claim] = await Promise.all([
      challenge.stats(edition.id),
      challenge.adminRanking(edition.id),
      challenge.listDisqualifications(edition.id),
      challenge.listActions(edition.id),
      challenge.duplicateAlerts(edition.id),
      challenge.getClaim(edition.id),
    ]);
    return c.json({
      edition: adminEdition(edition, now()),
      stats,
      ranking: rankingRows.map((row, i) => ({ ...row, position: i + 1, cookies: cookiesFor(row.score), achievedAt: row.achievedAt.toISOString() })),
      disqualifications,
      actions,
      alerts,
      claim,
    });
  });

  app.get("/api/admin/challenge/editions/:id/games", async (c) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const filter = c.req.query("filter") === "suspicious" ? "suspicious" : "all";
    return c.json({ games: await challenge.listGames(edition.id, filter) });
  });

  app.get("/api/admin/challenge/editions/:id/participants", async (c) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    return c.json({ participants: await challenge.listParticipants(edition.id) });
  });

  const reasonOf = async (c: Context, required: boolean) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return null;
    const reason = parseReason(parsed.body, required);
    return reason.ok ? { reason: reason.reason, body: parsed.body as Record<string, unknown> } : null;
  };
  const reasonError = (c: Context) => c.json({ error: "validation_error", fields: { reason: "Escribí el motivo (3 a 300 caracteres)." } }, 422);
  const small = bodyLimit({ maxSize: 2 * 1024, onError: tooLarge });

  app.post("/api/admin/challenge/editions/:id/pause", small, async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const input = await reasonOf(c, true);
    if (!input) return reasonError(c);
    if (effectiveStatus(edition, now()) !== "ACTIVE") return c.json({ error: "not_active" }, 409);
    const updated = await challenge.setPaused(edition.id, true, input.reason, c.get("userId"));
    if (!updated) return c.json({ error: "not_active" }, 409);
    forgetEdition(edition.id);
    log(`[admin] challenge #${edition.number} paused by ${c.get("userId")}`);
    return c.json(adminEdition(updated, now()));
  });

  app.post("/api/admin/challenge/editions/:id/resume", small, async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const input = await reasonOf(c, false);
    if (!input) return reasonError(c);
    if (effectiveStatus(edition, now()) !== "PAUSED") return c.json({ error: "not_paused" }, 409);
    const updated = await challenge.setPaused(edition.id, false, input.reason, c.get("userId"));
    if (!updated) return c.json({ error: "not_paused" }, 409);
    forgetEdition(edition.id);
    log(`[admin] challenge #${edition.number} resumed by ${c.get("userId")}`);
    return c.json(adminEdition(updated, now()));
  });

  app.post("/api/admin/challenge/games/:id/review", small, async (c: AppContext) => {
    const input = await reasonOf(c, true);
    if (!input) return reasonError(c);
    const decision = input.body.decision;
    if (decision !== "APPROVED" && decision !== "REJECTED") return c.json({ error: "validation_error", fields: { decision: "Elegí aprobar o rechazar." } }, 422);
    const current = await challenge.getGame(c.req.param("id") ?? "");
    if (!current) return c.json({ error: "not_found" }, 404);
    const edition = await challenge.getEdition(current.editionId);
    if (edition?.status === "RESULTS_PUBLISHED") return c.json({ error: "results_published" }, 409);
    const game = await challenge.reviewGame(current.id, decision, input.reason ?? "", c.get("userId"));
    if (!game) return c.json({ error: "not_found" }, 404);
    cache.delete(game.editionId);
    log(`[admin] challenge game ${game.id} ${decision} by ${c.get("userId")}`);
    return c.json({ game });
  });

  const participantChange = (action: "disqualify" | "reinstate") =>
    async (c: AppContext) => {
      const edition = await editionParam(c);
      if (!edition) return c.json({ error: "not_found" }, 404);
      if (edition.status === "RESULTS_PUBLISHED") return c.json({ error: "results_published" }, 409);
      const input = await reasonOf(c, true);
      if (!input) return reasonError(c);
      const participantId = typeof input.body.participantId === "string" ? input.body.participantId : "";
      if (!participantId) return c.json({ error: "validation_error", fields: { participantId: "Falta el participante." } }, 422);
      const done =
        action === "disqualify"
          ? await challenge.disqualify(edition.id, participantId, input.reason ?? "", c.get("userId"))
          : await challenge.reinstate(edition.id, participantId, input.reason ?? "", c.get("userId"));
      if (!done) return c.json({ error: action === "disqualify" ? "already_disqualified" : "not_disqualified" }, 409);
      cache.delete(edition.id);
      log(`[admin] challenge #${edition.number} ${action} ${participantId} by ${c.get("userId")}`);
      return c.json({ ok: true });
    };

  app.post("/api/admin/challenge/editions/:id/disqualify", small, participantChange("disqualify"));
  app.post("/api/admin/challenge/editions/:id/reinstate", small, participantChange("reinstate"));

  // Confirmar y publicar el ganador: solo con la edición cerrada (sábado o después)
  // y con el primer puesto revisado si estaba marcado. Crea su premio pendiente.
  app.post("/api/admin/challenge/editions/:id/publish", small, async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const status = effectiveStatus(edition, now());
    if (status === "RESULTS_PUBLISHED") return c.json({ error: "already_published" }, 409);
    if (status !== "FINISHED") return c.json({ error: "not_finished" }, 409);
    const input = await reasonOf(c, false);
    if (!input) return reasonError(c);
    const rows = await ranking(edition.id, true);
    const leader = rows[0] ?? null;
    if (leader) {
      const game = await challenge.getGame(leader.gameId);
      if (game?.review === "PENDING") return c.json({ error: "leader_needs_review", gameId: leader.gameId }, 409);
    }
    const updated = await challenge.publishResults(edition.id, leader, c.get("userId"), input.reason);
    if (!updated) return c.json({ error: "already_published" }, 409);
    forgetEdition(edition.id);
    log(`[admin] challenge #${edition.number} results published by ${c.get("userId")}`);
    return c.json(adminEdition(updated, now()));
  });

  // Estado del premio: contactado / entregado (solo hacia adelante, queda registrado).
  app.post("/api/admin/challenge/editions/:id/claim", small, async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const input = await reasonOf(c, false);
    if (!input) return reasonError(c);
    const status = input.body.status;
    if (status !== "CONTACTED" && status !== "DELIVERED") return c.json({ error: "validation_error", fields: { status: "Estado inválido." } }, 422);
    const claim = await challenge.setClaimStatus(edition.id, status, input.reason, c.get("userId"));
    if (!claim) return c.json({ error: "invalid_transition" }, 409);
    log(`[admin] challenge #${edition.number} prize ${status} by ${c.get("userId")}`);
    return c.json({ claim });
  });

  // Código de recuperación de sesión (se muestra UNA vez; se manda por Instagram).
  app.post("/api/admin/challenge/participants/:id/recovery", small, async (c: AppContext) => {
    const code = generateRecoveryCode();
    const expiresAt = new Date(now().getTime() + RECOVERY_TTL_MS);
    const participant = await challenge.setRecoveryCode(c.req.param("id") ?? "", hashRecoveryCode(code), expiresAt, c.get("userId"));
    if (!participant) return c.json({ error: "not_found" }, 404);
    log(`[admin] challenge recovery code for ${participant.id} by ${c.get("userId")}`);
    return c.json({ code, handle: handleOf(participant.instagram), expiresAt: expiresAt.toISOString() });
  });
}
