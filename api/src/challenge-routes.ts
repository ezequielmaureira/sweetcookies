import type { Context, Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import {
  DuplicateParticipantError,
  MAX_ATTEMPTS,
  MAX_PARTICIPANTS,
  MIN_ATTEMPTS,
  MIN_PARTICIPANTS,
  RECOVERY_TTL_MS,
  TOP_SIZE,
  assessGame,
  checkTournamentEdit,
  cookiesFor,
  finishDeadline,
  flattenTaps,
  generateRecoveryCode,
  generateToken,
  handleOf,
  hasContact,
  hashVisitor,
  isInviteCode,
  isRequestId,
  isVisitorId,
  hashIp,
  hashRecoveryCode,
  hashToken,
  isTokenShaped,
  minimumReached,
  normalizeInstagram,
  normalizeRecoveryCode,
  parseFinishInput,
  parseReason,
  phoneHint,
  publicEdition,
  publicRow,
  scoreTaps,
  validateClaim,
  validateContact,
  validateJoin,
  validateTournament,
  type ChallengeRepository,
  type ClaimRecord,
  type EditionRecord,
  type GameRecord,
  type ParticipantRecord,
  type RankingRow,
  type SaveResult,
} from "./challenge.ts";
import { cordobaDateTime, effectiveStatus } from "./challenge-time.ts";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";
import type { SettingsRepository } from "./repository.ts";

type Variables = { userId: string };
type AppContext = Context<{ Variables: Variables }>;

export type ChallengeConfig = {
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
  limiters?: Partial<Record<"register" | "recover" | "start" | "finish" | "claim" | "contact" | "visit" | "invite", RateLimiter>>;
};

const RANKING_CACHE_MS = 10_000;
/** Un torneo terminado se sigue mostrando en la página (resultados, ganador) hasta 7 días después. */
const SHOW_ENDED_MS = 7 * 24 * 60 * 60 * 1000;

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
 * - /api/public/challenge: lectura pública (torneo que muestra la página + top 10 con @, sin datos privados).
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
    // compañías móviles, Wi-Fi de una familia o escuela). Los intentos ya se
    // limitan por participante; esto solo frena abusos masivos.
    register: deps.limiters?.register ?? createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 }),
    recover: deps.limiters?.recover ?? createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
    start: deps.limiters?.start ?? createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 }),
    finish: deps.limiters?.finish ?? createRateLimiter({ limit: 120, windowMs: 10 * 60 * 1000 }),
    claim: deps.limiters?.claim ?? createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
    contact: deps.limiters?.contact ?? createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 }),
    visit: deps.limiters?.visit ?? createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 }),
    invite: deps.limiters?.invite ?? createRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 }),
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
   * Torneo que muestra la página (nunca se crea solo):
   * 1) el que está en curso (entre su inicio y su fin);
   * 2) si no, el último terminado, durante 7 días (resultados y ganador);
   * 3) si no, el próximo programado; 4) si no hay ninguno, null ("Próximamente").
   * `next` = el próximo programado cuando el principal es otro.
   * El estado se calcula siempre con la hora del servidor: así un torneo se
   * activa y finaliza solo. Se recuerda 10 s; reservar un intento siempre relee
   * (`fresh`) y las acciones del admin lo olvidan.
   */
  let tournamentCache: { at: number; value: { main: EditionRecord | null; next: EditionRecord | null } } | null = null;
  const current = async (fresh = false) => {
    const t = now();
    if (fresh || !tournamentCache || Date.now() - tournamentCache.at >= RANKING_CACHE_MS) {
      const { live, lastEnded, next, legacy } = await challenge.publicTournaments(t);
      const recent = lastEnded && t.getTime() - lastEnded.endsAt.getTime() <= SHOW_ENDED_MS ? lastEnded : null;
      // El histórico de prueba solo se ve si no hay ningún torneo real publicado que mostrar.
      const legacyVisible = legacy && t.getTime() - legacy.endsAt.getTime() <= SHOW_ENDED_MS ? legacy : null;
      const main = live ?? recent ?? next ?? legacyVisible;
      tournamentCache = { at: Date.now(), value: { main, next: main && next && main.id !== next.id ? next : null } };
    }
    const { main, next } = tournamentCache.value;
    return { edition: main, status: main ? effectiveStatus(main, t) : null, next, t };
  };
  const forgetEdition = (editionId: string) => {
    cache.delete(editionId);
    tournamentCache = null;
  };

  /**
   * Torneo que pidió un enlace (?torneo=ID): el enlace permanente que copia el
   * admin, o el de una invitación. Si es visible se muestra ese (programado,
   * activo, pausado, terminado o cancelado); el torneo vigente pasa a `next`
   * como aviso. Eliminado: linkStatus "removed" (solo el aviso, ningún dato).
   * Borrador, despublicado o inexistente: "invalid", sin revelar si existe.
   */
  const shown = async (requested: string | undefined) => {
    const base = await current();
    if (!requested) return { ...base, linkStatus: null as "ok" | "invalid" | "removed" | null };
    const linked = /^[A-Za-z0-9_-]{1,40}$/.test(requested) ? await challenge.getEdition(requested) : null;
    if (linked?.deletedAt && !linked.isTest) return { ...base, linkStatus: "removed" as const };
    // Borradores, despublicados e históricos eliminados no se muestran (sin revelar que existen).
    if (!linked || linked.deletedAt || linked.status === "DRAFT" || linked.status === "UNPUBLISHED") return { ...base, linkStatus: "invalid" as const };
    if (base.edition?.id === linked.id) return { ...base, linkStatus: "ok" as const };
    const other = base.edition && (base.status === "ACTIVE" || base.status === "SCHEDULED" || base.status === "PAUSED") ? base.edition : base.next;
    return { edition: linked, status: effectiveStatus(linked, base.t), next: other, t: base.t, linkStatus: "ok" as const };
  };

  /**
   * Mínimo de participantes válidos: los del ranking (al menos una partida
   * oficial válida y sin descalificar). Lo calcula siempre el servidor. null =
   * torneo anterior a la regla.
   */
  const minimumOf = (edition: EditionRecord, rows: RankingRow[]) =>
    edition.minParticipants === null ? null : { required: edition.minParticipants, valid: rows.length, reached: minimumReached(edition.minParticipants, rows.length) };

  const standing = (rows: RankingRow[], participantId: string) => {
    const index = rows.findIndex((r) => r.participantId === participantId);
    return index < 0 ? null : { position: index + 1, score: rows[index].score, cookies: cookiesFor(rows[index].score) };
  };

  /** Intentos oficiales del torneo: los que configuró el admin, para todo el torneo. */
  const attemptsOf = async (participantId: string, edition: EditionRecord) => {
    const used = await challenge.countAttempts(participantId, edition.id);
    return { limit: edition.attempts, used: Math.min(used, edition.attempts), left: Math.max(0, edition.attempts - used) };
  };

  const participantOf = async (c: Context): Promise<ParticipantRecord | null> => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!isTokenShaped(token)) return null;
    return challenge.findParticipantByTokenHash(hashToken(token), now());
  };

  /** Premio del jugador (sin datos de contacto: esos solo se ven en el panel). */
  const publicClaim = (claim: ClaimRecord) => ({
    editionId: claim.editionId,
    tournamentName: claim.editionName,
    prize: claim.prize,
    prizeDescription: claim.prizeDescription,
    prizeImageUrl: claim.prizeImageUrl,
    isTest: claim.isTest,
    status: claim.status,
  });

  /**
   * Lo que el propio participante ve de sus datos: si están completos, su
   * nombre y solo los últimos 4 dígitos del WhatsApp (nunca el número entero).
   */
  const ownContact = (participant: ParticipantRecord) => ({
    complete: hasContact(participant),
    name: participant.fullName,
    phoneHint: participant.phone ? phoneHint(participant.phone) : null,
  });
  const ownParticipant = (participant: ParticipantRecord) => ({ handle: handleOf(participant.instagram), contact: ownContact(participant) });

  /* ---------- Público ---------- */

  app.get("/api/public/challenge", async (c) => {
    const { edition, status, next, t, linkStatus } = await shown(c.req.query("torneo"));
    const [rows, siteSettings] = await Promise.all([edition ? ranking(edition.id) : Promise.resolve([]), settings.get()]);
    const winner =
      edition && status === "RESULTS_PUBLISHED" && edition.winnerParticipantId
        ? (rows.find((r) => r.participantId === edition.winnerParticipantId) ?? null)
        : null;
    c.header("Cache-Control", "public, max-age=5, s-maxage=5");
    return c.json({
      tournament: edition && status ? publicEdition(edition, t, status) : null,
      next: next ? publicEdition(next, t, effectiveStatus(next, t)) : null,
      serverNow: t.toISOString(),
      leaderboard: rows.slice(0, TOP_SIZE).map((row, i) => publicRow(row, i + 1)),
      ranked: rows.length,
      winner: edition && winner ? { handle: handleOf(winner.instagram), score: edition.winnerScore ?? winner.score, cookies: cookiesFor(edition.winnerScore ?? winner.score) } : null,
      // Solo conteos (nunca quiénes): para "no alcanzó el mínimo" al terminar.
      minimum: edition ? minimumOf(edition, rows) : null,
      instagramHandle: siteSettings.instagramHandle,
      linkStatus,
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

  // Participar: @ de Instagram + nombre y apellido + WhatsApp + aceptar las bases.
  // Los datos de contacto son privados: solo sirven para avisarle si gana. No se
  // comprueba si sigue la cuenta (no hay forma confiable sin la API de Meta).
  app.post("/api/challenge/register", bodyLimit({ maxSize: 2 * 1024, onError: tooLarge }), async (c) => {
    if (!allow(limit.register, c)) return c.json({ error: "too_many_requests" }, 429);
    // Con una sesión válida no se registra otro @: cambiar de usuario no reinicia los intentos.
    if (await participantOf(c)) return c.json({ error: "already_has_session" }, 409);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateJoin(parsed.body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);

    const token = generateToken();
    const ipHash = ipHashOf(c);
    try {
      const participant = await challenge.createParticipant({ instagram: result.instagram, contact: result.contact, tokenHash: hashToken(token), ipHash, now: now() });
      log(`[challenge] participant ${participant.id} joined`);
      await attributeReferral((parsed.body as Record<string, unknown>).ref, participant.id, ipHash);
      // El token se entrega UNA sola vez: la base guarda solo su hash.
      return c.json({ token, participant: ownParticipant(participant) }, 201);
    } catch (error) {
      if (!(error instanceof DuplicateParticipantError)) throw error;
      // El mismo @ desde otro navegador NO obtiene otra sesión ni más intentos. Queda como alerta.
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

  /**
   * Atribución de un registro NUEVO a un enlace de invitación (la decide el
   * servidor). Solo cuenta para torneos visibles y no cancelados, una vez por
   * persona y torneo, y nunca a sí misma. Si viene desde la misma conexión que
   * quien invitó (familia o la misma persona) se guarda marcado aparte. Nunca
   * da intentos, puntos ni ventajas. Un fallo acá no impide registrarse.
   */
  async function attributeReferral(ref: unknown, referredId: string, ipHash: string | null) {
    if (!isInviteCode(ref)) return;
    try {
      const invite = await challenge.findInviteByCode(ref);
      if (!invite || invite.participantId === referredId) return;
      const edition = await challenge.getEdition(invite.editionId);
      if (!edition || edition.deletedAt || edition.status === "DRAFT" || edition.status === "UNPUBLISHED" || edition.status === "CANCELLED") return;
      const sameConnection = ipHash !== null && ipHash === invite.ipHash;
      await challenge.recordReferral({ editionId: invite.editionId, inviteId: invite.id, referrerId: invite.participantId, referredId, sameConnection });
    } catch (error) {
      log(`[challenge] referral attribution failed: ${error instanceof Error ? error.message : "error"}`);
    }
  }

  // Enlace personal de invitación para el torneo que ve el jugador (o ?torneo=ID).
  // Devuelve solo el código público y el id del torneo: nada privado.
  app.post("/api/challenge/invites", async (c) => {
    if (!allow(limit.invite, c)) return c.json({ error: "too_many_requests" }, 429);
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const { edition, status } = await shown(c.req.query("torneo"));
    if (!edition || !status || status === "DRAFT" || status === "CANCELLED") return c.json({ error: "no_tournament" }, 409);
    const invite = await challenge.getOrCreateInvite(edition.id, participant.id, ipHashOf(c));
    return c.json({ code: invite.code, tournamentId: edition.id });
  });

  // Visita a un enlace: una por visitante. Siempre responde igual (no revela si el código existe).
  app.post("/api/challenge/visits", bodyLimit({ maxSize: 512, onError: tooLarge }), async (c) => {
    if (!allow(limit.visit, c)) return c.body(null, 204);
    const parsed = await readJson(c);
    const body = parsed.ok && parsed.body && typeof parsed.body === "object" ? (parsed.body as Record<string, unknown>) : {};
    if (!isInviteCode(body.ref) || !isVisitorId(body.visitor)) return c.body(null, 204);
    const invite = await challenge.findInviteByCode(body.ref);
    if (!invite) return c.body(null, 204);
    // Quien invita abriendo su propio enlace no suma visitas.
    const viewer = await participantOf(c);
    if (viewer?.id === invite.participantId) return c.body(null, 204);
    await challenge.recordVisit(invite.id, hashVisitor(body.visitor), ipHashOf(c));
    return c.body(null, 204);
  });

  // Datos de contacto del propio participante (su token): los deja si es un
  // participante anterior o los corrige. No toca intentos, partidas ni puntajes.
  // Nunca devuelve el número entero.
  app.post("/api/challenge/contact", bodyLimit({ maxSize: 1024, onError: tooLarge }), async (c) => {
    if (!allow(limit.contact, c)) return c.json({ error: "too_many_requests" }, 429);
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const input = validateContact(parsed.body);
    if (!input.ok) return c.json({ error: "validation_error", fields: input.errors }, 422);
    const updated = await challenge.updateContact(participant.id, input.data, now());
    if (!updated) return c.json({ error: "no_session" }, 401);
    log(`[challenge] participant ${participant.id} ${hasContact(participant) ? "updated" : "added"} contact data`);
    return c.json({ participant: ownParticipant(updated) });
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
    return c.json({ token, participant: ownParticipant(participant) });
  });

  app.get("/api/challenge/me", async (c) => {
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const { edition, status, t } = await shown(c.req.query("torneo"));
    const [rows, attempts, disqualified, claims] = await Promise.all([
      edition ? ranking(edition.id) : Promise.resolve([]),
      edition ? attemptsOf(participant.id, edition) : Promise.resolve(null),
      edition ? challenge.isDisqualified(edition.id, participant.id) : Promise.resolve(false),
      challenge.claimsOf(participant.id),
    ]);
    return c.json({
      participant: ownParticipant(participant),
      tournament: edition && status ? publicEdition(edition, t, status) : null,
      attempts,
      best: standing(rows, participant.id),
      ranked: rows.length,
      disqualified,
      // Solo premios que todavía requieren algo del ganador o están en curso.
      claims: claims.filter((cl) => cl.status !== "DELIVERED").map(publicClaim),
    });
  });

  // Reserva ATÓMICA del intento: el índice único (participante, torneo, intento)
  // impide que dos pestañas o pedidos simultáneos superen los intentos del torneo.
  // Solo dentro de las fechas del torneo (hora del servidor).
  app.post("/api/challenge/games", async (c) => {
    if (!allow(limit.start, c)) return c.json({ error: "too_many_requests" }, 429);
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const { edition, status, t } = await current(true);
    if (!edition || status !== "ACTIVE" || edition.isTest || edition.deletedAt) return c.json({ error: "edition_not_active", status }, 409);
    if (await challenge.isDisqualified(edition.id, participant.id)) return c.json({ error: "disqualified" }, 403);
    // Sin nombre y WhatsApp no se juega (participantes anteriores: los dejan primero; sus intentos y puntajes se conservan).
    if (!hasContact(participant)) return c.json({ error: "contact_required" }, 409);

    // Idempotencia: el navegador manda un id por cada toque de "Jugar". Un doble
    // toque o un reintento de red con el mismo id devuelve la MISMA partida y no
    // consume otro intento.
    const parsed = await readJson(c);
    const requested = parsed.ok && parsed.body && typeof parsed.body === "object" ? (parsed.body as Record<string, unknown>).requestId : undefined;
    const clientRequestId = isRequestId(requested) ? requested : null;
    const reply = async (game: GameRecord, status: 200 | 201) =>
      c.json({ game: { id: game.id, durationMs: edition.gameDurationMs, attemptNumber: game.attemptNumber }, attempts: await attemptsOf(participant.id, edition), replayed: status === 200 }, status);
    if (clientRequestId) {
      const previous = await challenge.findGameByRequest(participant.id, clientRequestId);
      if (previous) return reply(previous, 200);
    }

    const ipHash = ipHashOf(c);
    for (let attempt = 0; attempt < 3; attempt++) {
      const used = await challenge.countAttempts(participant.id, edition.id);
      if (used >= edition.attempts) return c.json({ error: "no_attempts", attempts: await attemptsOf(participant.id, edition) }, 429);
      const game = await challenge.createGame({ editionId: edition.id, participantId: participant.id, attemptNumber: used + 1, startedAt: t, ipHash, clientRequestId });
      if (game) return reply(game, 201);
      // Lo frenó el índice único: o el mismo pedido llegó dos veces a la vez, u otra pestaña tomó ese número.
      if (clientRequestId) {
        const same = await challenge.findGameByRequest(participant.id, clientRequestId);
        if (same) return reply(same, 200);
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
      tournament: publicEdition(edition, t, effectiveStatus(edition, t)),
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
    // Una partida empezada antes del cierre se acepta con un margen técnico acotado (ver finishDeadline).
    if (now().getTime() > finishDeadline(game.startedAt, edition.gameDurationMs, edition.endsAt)) {
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

  // Reclamo del premio de un ganador que NO tenía datos registrados (participantes
  // anteriores): solo su sesión, una sola vez. Con datos registrados el premio ya
  // nace con ellos y no se piden de nuevo.
  app.post("/api/challenge/claims/:editionId", bodyLimit({ maxSize: 1024, onError: tooLarge }), async (c) => {
    if (!allow(limit.claim, c)) return c.json({ error: "too_many_requests" }, 429);
    const participant = await participantOf(c);
    if (!participant) return c.json({ error: "no_session" }, 401);
    const editionId = c.req.param("editionId") ?? "";
    const claim = await challenge.getClaim(editionId);
    if (!claim || claim.participantId !== participant.id) return c.json({ error: "not_winner" }, 403);
    // Un torneo eliminado o histórico de prueba nunca habilita reclamos.
    const claimEdition = await challenge.getEdition(editionId);
    if (!claimEdition || claimEdition.deletedAt || claimEdition.isTest) return c.json({ error: "not_winner" }, 403);
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
    number: edition.number,
    // Para volver a llenar el formulario en hora de Córdoba.
    start: cordobaDateTime(edition.startsAt),
    end: cordobaDateTime(edition.endsAt),
    storedStatus: edition.status,
    /** Publicado = visible al público (distinto de activo). */
    published: !edition.deletedAt && ["SCHEDULED", "ACTIVE", "PAUSED", "FINISHED", "RESULTS_PUBLISHED"].includes(edition.status),
    /** Torneo histórico de prueba (anterior a los torneos reales). */
    legacy: edition.isTest,
    cancelledAt: edition.cancelledAt?.toISOString() ?? null,
    cancelReason: edition.cancelReason,
    deletedAt: edition.deletedAt?.toISOString() ?? null,
    deleteReason: edition.deleteReason,
    pausedAt: edition.pausedAt?.toISOString() ?? null,
    pauseReason: edition.pauseReason,
    winnerParticipantId: edition.winnerParticipantId,
    winnerGameId: edition.winnerGameId,
    winnerScore: edition.winnerScore,
    resultsPublishedAt: edition.resultsPublishedAt?.toISOString() ?? null,
  });

  const editionParam = async (c: Context) => challenge.getEdition(c.req.param("id") ?? "");

  // Resumen del panel: torneo activo, próximo, y lo que espera revisión.
  app.get("/api/admin/challenge/overview", async (c) => {
    const t = now();
    const { live, next } = await challenge.publicTournaments(t);
    const [liveStats, liveAlerts, pending] = await Promise.all([
      live ? challenge.stats(live.id) : Promise.resolve(null),
      live ? challenge.duplicateAlerts(live.id) : Promise.resolve([]),
      challenge.pendingWinnerEditions(t),
    ]);
    // Los que no alcanzaron el mínimo no esperan nada del admin: terminan sin premio.
    const reached = await Promise.all(pending.map(async (e) => minimumReached(e.minParticipants, (await ranking(e.id)).length)));
    const pendingWinners = reached.filter(Boolean).length;
    return c.json({
      ipTracking: config.ipSecret !== null,
      limits: { minAttempts: MIN_ATTEMPTS, maxAttempts: MAX_ATTEMPTS, minParticipants: MIN_PARTICIPANTS, maxParticipants: MAX_PARTICIPANTS },
      live: live ? adminEdition(live, t) : null,
      next: next ? adminEdition(next, t) : null,
      liveStats,
      liveAlerts: liveAlerts.length,
      pendingWinners,
      serverNow: t.toISOString(),
    });
  });

  app.get("/api/admin/challenge/editions", async (c) => {
    const t = now();
    const rows = await challenge.listEditions();
    return c.json({
      editions: rows.map((e) => ({
        ...adminEdition(e, t),
        participants: e.participants,
        validParticipants: e.validParticipants,
        minimumReached: minimumReached(e.minParticipants, e.validParticipants),
        games: e.games,
      })),
    });
  });

  const saveError = (c: Context, result: Exclude<SaveResult, { ok: true }>) =>
    result.conflict
      ? c.json({ error: "overlap", message: `Las fechas se superponen con "${result.conflict.name}". Solo puede haber un torneo a la vez.`, conflictId: result.conflict.id }, 409)
      : c.json({ error: "not_found" }, 404);

  /** Publicar exige que el torneo no haya terminado ya. */
  const endedAlready = (endsAt: Date) => endsAt.getTime() <= now().getTime();

  // Crear torneo: SIEMPRE en borrador (no visible). Publicarlo es un paso aparte.
  app.post("/api/admin/challenge/editions", bodyLimit({ maxSize: 8 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const input = validateTournament(parsed.body);
    if (!input.ok) return c.json({ error: "validation_error", fields: input.errors }, 422);
    const result = await challenge.createEdition(input.data, c.get("userId"));
    if (!result.ok) return saveError(c, result);
    log(`[admin] challenge tournament ${result.edition.id} created as draft by ${c.get("userId")}`);
    return c.json(adminEdition(result.edition, now()), 201);
  });

  // Editar torneo, con las reglas que protegen la competencia (checkTournamentEdit).
  app.put("/api/admin/challenge/editions/:id", bodyLimit({ maxSize: 8 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const input = validateTournament(parsed.body);
    if (!input.ok) return c.json({ error: "validation_error", fields: input.errors }, 422);
    const body = parsed.body as Record<string, unknown>;
    const reason = parseReason(body, false);
    if (!reason.ok) return reasonError(c);
    const t = now();
    const status = effectiveStatus(edition, t);
    const check = checkTournamentEdit(edition, status, input.data, {
      games: await challenge.countGames(edition.id),
      reason: reason.reason,
      confirmPrizeChange: body.confirmPrizeChange === true,
      now: t,
    });
    if (!check.ok) return c.json({ error: check.error, message: check.message }, 409);
    if (status !== "DRAFT" && status !== "UNPUBLISHED" && endedAlready(input.data.endsAt)) return c.json({ error: "validation_error", fields: { end: "La finalización ya pasó." } }, 422);
    const result = await challenge.updateEdition(edition.id, input.data, check.changes, reason.reason, c.get("userId"));
    if (!result.ok) return saveError(c, result);
    forgetEdition(edition.id);
    log(`[admin] challenge tournament ${edition.id} updated (${check.changes.join(",") || "no changes"}) by ${c.get("userId")}`);
    return c.json(adminEdition(result.edition, now()));
  });

  /** Error claro (409) con mensaje para el panel. */
  const refuse = (c: Context, error: string, message: string) => c.json({ error, message }, 409);

  // PUBLICAR (borrador o despublicado → visible). Antes de su inicio queda
  // PROGRAMADO; entre sus fechas, ACTIVO. Lo decide siempre el admin.
  const publish = async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition || edition.deletedAt) return c.json({ error: "not_found" }, 404);
    if (edition.isTest) return refuse(c, "legacy", "Los torneos históricos de prueba no se pueden volver a publicar.");
    if (edition.status !== "DRAFT" && edition.status !== "UNPUBLISHED") return refuse(c, "already_published", "Este torneo ya está publicado.");
    if (endedAlready(edition.endsAt)) return refuse(c, "ended", "La finalización ya pasó: editá las fechas antes de publicarlo.");
    const result = await challenge.publishEdition(edition.id, c.get("userId"));
    if (!result.ok) return saveError(c, result);
    forgetEdition(edition.id);
    log(`[admin] challenge tournament ${edition.id} published by ${c.get("userId")}`);
    return c.json(adminEdition(result.edition, now()));
  };
  app.post("/api/admin/challenge/editions/:id/schedule", publish);
  app.post("/api/admin/challenge/editions/:id/publish-tournament", publish);

  // DESPUBLICAR: deja de verse y de aceptar partidas; conserva participantes y resultados.
  app.post("/api/admin/challenge/editions/:id/unpublish", bodyLimit({ maxSize: 2 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition || edition.deletedAt) return c.json({ error: "not_found" }, 404);
    const input = await reasonOf(c, false);
    if (!input) return reasonError(c);
    const status = effectiveStatus(edition, now());
    if (status !== "SCHEDULED" && status !== "ACTIVE" && status !== "PAUSED") return refuse(c, "not_published", "Solo se despublica un torneo programado, activo o pausado.");
    const updated = await challenge.unpublishEdition(edition.id, input.reason, c.get("userId"));
    if (!updated) return refuse(c, "not_published", "El torneo cambió: recargá.");
    forgetEdition(edition.id);
    log(`[admin] challenge tournament ${edition.id} unpublished by ${c.get("userId")}`);
    return c.json(adminEdition(updated, now()));
  });

  // FINALIZAR ahora: no acepta más partidas y queda listo para confirmar el ganador.
  app.post("/api/admin/challenge/editions/:id/finish", bodyLimit({ maxSize: 2 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition || edition.deletedAt) return c.json({ error: "not_found" }, 404);
    const input = await reasonOf(c, false);
    if (!input) return reasonError(c);
    const t = now();
    const status = effectiveStatus(edition, t);
    if (status === "SCHEDULED") return refuse(c, "not_started", "El torneo todavía no empezó: si no querés que se vea, despublicalo.");
    if (status !== "ACTIVE" && status !== "PAUSED") return refuse(c, "not_running", "Solo se finaliza un torneo activo o pausado.");
    const updated = await challenge.finishEdition(edition.id, t, input.reason, c.get("userId"));
    if (!updated) return refuse(c, "not_running", "El torneo cambió: recargá.");
    forgetEdition(edition.id);
    log(`[admin] challenge tournament ${edition.id} finished by ${c.get("userId")}`);
    return c.json(adminEdition(updated, now()));
  });

  // Qué tiene el torneo antes de eliminarlo (para la advertencia del panel).
  app.get("/api/admin/challenge/editions/:id/deletion", async (c) => {
    const edition = await editionParam(c);
    if (!edition || edition.deletedAt) return c.json({ error: "not_found" }, 404);
    const info = await challenge.deletionInfo(edition.id);
    return info ? c.json(info) : c.json({ error: "not_found" }, 404);
  });

  // ELIMINAR: exige escribir "ELIMINAR". Sin actividad se borra definitivamente;
  // con participantes, partidas o resultados es una eliminación lógica que
  // conserva el historial (nada se borra en cascada) y deja de bloquear fechas.
  app.delete("/api/admin/challenge/editions/:id", bodyLimit({ maxSize: 2 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition || edition.deletedAt) return c.json({ error: "not_found" }, 404);
    const parsed = await readJson(c);
    const body = parsed.ok && parsed.body && typeof parsed.body === "object" ? (parsed.body as Record<string, unknown>) : {};
    if (body.confirm !== "ELIMINAR") return c.json({ error: "validation_error", fields: { confirm: "Escribí ELIMINAR para confirmar." } }, 422);
    const reason = parseReason(body, false);
    if (!reason.ok) return reasonError(c);
    const result = await challenge.deleteEdition(edition.id, reason.reason, c.get("userId"));
    if (!result) return c.json({ error: "not_found" }, 404);
    forgetEdition(edition.id);
    log(`[admin] challenge tournament ${edition.id} deleted (${result.mode}) by ${c.get("userId")}`);
    return c.json({ ok: true, mode: result.mode });
  });

  app.get("/api/admin/challenge/editions/:id", async (c) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const [stats, rankingRows, disqualifications, actions, alerts, claim, rows] = await Promise.all([
      challenge.stats(edition.id),
      challenge.adminRanking(edition.id),
      challenge.listDisqualifications(edition.id),
      challenge.listActions(edition.id),
      challenge.duplicateAlerts(edition.id),
      challenge.getClaim(edition.id),
      ranking(edition.id, true),
    ]);
    return c.json({
      edition: adminEdition(edition, now()),
      stats,
      minimum: minimumOf(edition, rows),
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

  // Invitaciones del torneo: enlaces, visitas, registros atribuidos y quiénes más atrajeron (solo @).
  app.get("/api/admin/challenge/editions/:id/invites", async (c) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const stats = await challenge.inviteStats(edition.id);
    return c.json({
      ...stats,
      conversion: stats.visits > 0 ? Math.round((stats.registrations / stats.visits) * 1000) / 10 : null,
      // Solo @ y conteos: nunca ids internos.
      top: stats.top.map((row) => ({ instagram: row.instagram, visits: row.visits, registrations: row.registrations, sameConnection: row.sameConnection })),
    });
  });

  app.get("/api/admin/challenge/editions/:id/participants", async (c) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    return c.json({ participants: await challenge.listParticipants(edition.id) });
  });

  // Cancelar: motivo obligatorio; se conserva todo el historial.
  app.post("/api/admin/challenge/editions/:id/cancel", bodyLimit({ maxSize: 2 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const input = await reasonOf(c, true);
    if (!input) return reasonError(c);
    const updated = await challenge.cancelEdition(edition.id, input.reason ?? "", c.get("userId"));
    if (!updated) return c.json({ error: "cannot_cancel", message: "Un torneo con ganador publicado o ya cancelado no se puede cancelar." }, 409);
    forgetEdition(edition.id);
    log(`[admin] challenge tournament ${edition.id} cancelled by ${c.get("userId")}`);
    return c.json(adminEdition(updated, now()));
  });

  async function reasonOf(c: Context, required: boolean) {
    const parsed = await readJson(c);
    if (!parsed.ok) return null;
    const reason = parseReason(parsed.body, required);
    return reason.ok ? { reason: reason.reason, body: parsed.body as Record<string, unknown> } : null;
  }
  function reasonError(c: Context) {
    return c.json({ error: "validation_error", fields: { reason: "Escribí el motivo (3 a 300 caracteres)." } }, 422);
  }
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
    // Un histórico de prueba no se reactiva: no se convierte en competencia real.
    if (edition.isTest) return refuse(c, "legacy", "Los torneos históricos de prueba no se reanudan. Podés eliminarlo y crear un torneo nuevo.");
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

  // Confirmar y publicar el ganador: solo con el torneo cerrado (después de su fin)
  // y con el primer puesto revisado si estaba marcado. Crea su premio pendiente.
  app.post("/api/admin/challenge/editions/:id/publish", small, async (c: AppContext) => {
    const edition = await editionParam(c);
    if (!edition) return c.json({ error: "not_found" }, 404);
    const status = effectiveStatus(edition, now());
    if (edition.deletedAt) return c.json({ error: "not_found" }, 404);
    // Los históricos de prueba nunca generan ganador con premio.
    if (edition.isTest) return refuse(c, "legacy", "Los torneos históricos de prueba no tienen ganador con premio.");
    if (status === "RESULTS_PUBLISHED") return c.json({ error: "already_published" }, 409);
    if (status !== "FINISHED") return c.json({ error: "not_finished" }, 409);
    const input = await reasonOf(c, false);
    if (!input) return reasonError(c);
    const rows = await ranking(edition.id, true);
    // Sin el mínimo de participantes válidos no hay ganador ni reclamo de premio.
    const minimum = minimumOf(edition, rows);
    if (minimum && !minimum.reached) {
      return c.json(
        {
          error: "minimum_not_met",
          message: `Mínimo de participantes no alcanzado: ${minimum.valid} de ${minimum.required}. El torneo termina sin adjudicar el premio.`,
          minimum,
        },
        409,
      );
    }
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

  // Borrar nombre y WhatsApp de un participante (pedido de eliminación). Se los
  // vuelve a pedir antes de jugar; sus partidas y resultados se conservan.
  app.post("/api/admin/challenge/participants/:id/erase-contact", small, async (c: AppContext) => {
    const input = await reasonOf(c, false);
    if (!input) return reasonError(c);
    const done = await challenge.eraseContact(c.req.param("id") ?? "", input.reason, c.get("userId"));
    if (!done) return c.json({ error: "not_found" }, 404);
    log(`[admin] challenge contact data erased for ${c.req.param("id")} by ${c.get("userId")}`);
    return c.json({ ok: true });
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
