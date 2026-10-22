"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import {
  ACTION_LABELS,
  CLAIM_LABELS,
  FLAG_LABELS,
  STATUS_LABELS,
  connectionLabel,
  createRecoveryCode,
  disqualify,
  getCurrentEdition,
  getEdition,
  listEditions,
  listGames,
  listParticipants,
  pauseEdition,
  publishResults,
  reinstate,
  resumeEdition,
  reviewGame,
  rhythm,
  setClaimStatus,
  type AdminEdition,
  type AdminGame,
  type AdminParticipant,
  type CurrentEdition,
  type EditionDetail,
  type Review,
} from "@/lib/admin/challenge-admin-api";
import { formatCordobaDateTime } from "@/lib/challenge/challenge-format";
import admin from "@/components/admin/Admin.module.css";
import styles from "./ChallengeAdmin.module.css";

const REVIEW_LABELS: Record<Review, string> = { NONE: "Sin marcas", PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada" };

const when = (iso: string | null) => (iso ? formatCordobaDateTime(iso) : "—");
const editionName = (e: AdminEdition) => `${e.isTest ? "Prueba" : "Edición"} #${e.number}`;
const igLink = (instagram: string) => (
  <a href={`https://www.instagram.com/${encodeURIComponent(instagram)}/`} target="_blank" rel="noreferrer">
    @{instagram}
  </a>
);

/** Pide un motivo (obligatorio salvo que se indique). null = canceló. */
function askReason(question: string, required = true): string | null {
  const answer = window.prompt(question);
  if (answer === null) return null;
  const reason = answer.trim();
  if (required && reason.length < 3) {
    window.alert("El motivo es obligatorio (mínimo 3 caracteres).");
    return null;
  }
  return reason;
}

/**
 * Campeonato (admin): edición vigente o anteriores (prueba u oficiales),
 * ranking, alertas de posibles duplicados, partidas sospechosas,
 * descalificaciones, pausa, confirmación del ganador, premio y recuperación de
 * sesiones. Toda acción pide motivo y queda registrada. No se puede editar un
 * puntaje: solo aprobar o rechazar partidas.
 */
export function ChallengeAdmin() {
  const { getToken, isLoaded } = useAuth();
  const [config, setConfig] = useState<CurrentEdition | null>(null);
  const [editions, setEditions] = useState<AdminEdition[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<EditionDetail | null>(null);
  const [games, setGames] = useState<AdminGame[]>([]);
  const [gameFilter, setGameFilter] = useState<"suspicious" | "all">("suspicious");
  const [participants, setParticipants] = useState<AdminParticipant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  // Edición vigente (se crea sola si no existe) + historial.
  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const token = await getToken();
        const current = await getCurrentEdition(token);
        setConfig(current);
        setEditions(await listEditions(token));
        setSelected((s) => s ?? current.id);
      } catch (e) {
        setError(adminErrorMessage(e, "No pudimos cargar el campeonato."));
      }
    })();
  }, [getToken, isLoaded]);

  const load = useCallback(async () => {
    if (!selected) return;
    const current = ++requestId.current;
    try {
      const token = await getToken();
      const [nextDetail, nextGames] = await Promise.all([getEdition(token, selected), listGames(token, selected, gameFilter)]);
      if (current !== requestId.current) return;
      setDetail(nextDetail);
      setGames(nextGames);
      setError(null);
    } catch (e) {
      if (current === requestId.current) setError(adminErrorMessage(e, "No pudimos cargar la edición."));
    }
  }, [selected, gameFilter, getToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadParticipants = async () => {
    if (!selected) return;
    try {
      setParticipants(await listParticipants(await getToken(), selected));
    } catch (e) {
      setNotice(adminErrorMessage(e, "No pudimos cargar los participantes."));
    }
  };

  /** Ejecuta una acción del admin y recarga. */
  const run = async (action: (token: string | null) => Promise<unknown>, done: string, conflict: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action(await getToken());
      setNotice(done);
      await load();
      setEditions(await listEditions(await getToken()));
      if (participants !== null) await loadParticipants();
    } catch (e) {
      setNotice(e instanceof AdminApiError && e.status === 409 ? conflict : adminErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** Código de un solo uso para recuperar la sesión (se muestra una vez; se manda por Instagram). */
  const recovery = async (participantId: string, instagram: string) => {
    if (
      !window.confirm(
        `¿Generar un código de recuperación para @${instagram}? Mandáselo solo por Instagram a esa cuenta, después de confirmar que es la persona. Al usarlo, la sesión anterior deja de valer.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { code, expiresAt } = await createRecoveryCode(await getToken(), participantId);
      window.prompt(`Código para @${instagram} (vence ${when(expiresAt)}). Copialo ahora: no se vuelve a mostrar.`, code);
      if (participants !== null) await loadParticipants();
    } catch (e) {
      setNotice(adminErrorMessage(e, "No pudimos generar el código."));
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) return <p className={admin.error}>{error}</p>;
  if (!detail) return <p className={styles.muted}>Cargando campeonato…</p>;

  const { edition, stats, ranking, alerts, claim, disqualifications, actions } = detail;
  const leader = ranking[0] ?? null;
  const winnerHandle = claim ? (ranking.find((r) => r.participantId === claim.participantId)?.instagram ?? null) : null;
  const published = edition.status === "RESULTS_PUBLISHED";

  return (
    <div className={styles.stack}>
      {config && (
        <section className={`${admin.section} ${config.mode === "test" ? styles.testMode : ""}`}>
          <p>
            <strong>{config.mode === "test" ? "Modo PRUEBA privada" : "Modo OFICIAL"}</strong> ·{" "}
            {config.mode === "test"
              ? "las ediciones se marcan como prueba y no tienen premio real. El campeonato público se activa solo con CHALLENGE_MODE=official en el servidor."
              : "las ediciones nuevas son oficiales."}
          </p>
          {!config.ipTracking && <p className={styles.alertText}>Sin CHALLENGE_IP_SECRET en el servidor: no se registran conexiones y no hay alertas por IP.</p>}
        </section>
      )}

      <section className={admin.section}>
        <div className={styles.headerRow}>
          <div>
            <h2 className={admin.sectionTitle}>
              {editionName(edition)} · <span className={styles[`status${edition.status}`]}>{STATUS_LABELS[edition.status]}</span>
            </h2>
            <p className={styles.muted}>
              Competencia: {when(edition.startsAt)} → {when(edition.endsAt)} · revisión hasta {when(edition.reviewEndsAt)} (hora de Córdoba) · {edition.attempts} intentos por
              participante
            </p>
            {edition.pauseReason && <p className={styles.muted}>Pausa: {edition.pauseReason}</p>}
          </div>
          <label className={styles.select}>
            <span>Edición</span>
            <select
              value={selected ?? ""}
              onChange={(e) => {
                setParticipants(null);
                setSelected(e.target.value);
              }}
            >
              {editions.map((e) => (
                <option key={e.id} value={e.id}>
                  {editionName(e)} · semana del {e.weekStart} · {STATUS_LABELS[e.status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <dl className={styles.stats}>
          <div>
            <dt>Participantes</dt>
            <dd>{stats.participants}</dd>
          </div>
          <div>
            <dt>Partidas oficiales</dt>
            <dd>{stats.games}</dd>
          </div>
          <div>
            <dt>Terminadas</dt>
            <dd>{stats.finished}</dd>
          </div>
          <div>
            <dt>Pendientes de revisión</dt>
            <dd className={stats.pendingReview ? styles.alert : undefined}>{stats.pendingReview}</dd>
          </div>
          <div>
            <dt>Alertas de conexión</dt>
            <dd className={alerts.length ? styles.alert : undefined}>{alerts.length}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          {edition.status === "ACTIVE" && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                const reason = askReason("Motivo de la pausa (queda registrado):");
                if (reason) void run((t) => pauseEdition(t, edition.id, reason), "Campeonato pausado: no se aceptan partidas oficiales nuevas.", "La edición ya no está activa.");
              }}
            >
              Pausar campeonato
            </Button>
          )}
          {edition.status === "PAUSED" && (
            <Button
              disabled={busy}
              onClick={() => {
                const reason = askReason("Motivo para reanudar (opcional):", false);
                if (reason !== null) void run((t) => resumeEdition(t, edition.id, reason), "Campeonato reanudado.", "La edición no está pausada.");
              }}
            >
              Reanudar campeonato
            </Button>
          )}
          {edition.status === "FINISHED" && (
            <Button
              disabled={busy}
              onClick={() => {
                const who = leader ? `@${leader.instagram} con ${leader.score} mordidas` : "sin ganador (no hubo resultados válidos)";
                if (!window.confirm(`¿Confirmar y publicar el ganador? ${who}. Se mostrará en la página y no se puede deshacer.`)) return;
                const reason = askReason("Nota de verificación (por ejemplo, que la cuenta de Instagram existe). Opcional:", false);
                if (reason !== null)
                  void run(
                    (t) => publishResults(t, edition.id, reason),
                    "Ganador confirmado y publicado. Ya puede reclamar su premio desde su sesión.",
                    "No se pudo publicar: el primer puesto tiene una revisión pendiente o la edición cambió.",
                  );
              }}
            >
              Confirmar y publicar ganador
            </Button>
          )}
        </div>
        {edition.status === "FINISHED" && leader && leader.review === "PENDING" && (
          <p className={styles.alertText}>El primer puesto tiene una partida marcada: aprobala o rechazala antes de publicar.</p>
        )}
        {published && (
          <p className={styles.muted}>
            Ganador confirmado: {winnerHandle ? `@${winnerHandle}` : "—"} · {edition.winnerScore ?? "—"} mordidas · publicado {when(edition.resultsPublishedAt)}
          </p>
        )}
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
      </section>

      {claim && (
        <section className={admin.section}>
          <h2 className={admin.sectionTitle}>Premio del ganador{edition.isTest ? " (prueba: no es real)" : ""}</h2>
          <p>
            Estado: <strong>{CLAIM_LABELS[claim.status]}</strong> · Ganador: {winnerHandle ? igLink(winnerHandle) : "—"}
          </p>
          {claim.name && claim.phone ? (
            <p className={styles.contact}>
              <span>{claim.name}</span>
              <a href={`https://wa.me/${claim.phone}`} target="_blank" rel="noreferrer">
                +{claim.phone}
              </a>
              <span className={styles.flags}>Reclamado {when(claim.claimedAt)}</span>
            </p>
          ) : (
            <p className={styles.muted}>
              Todavía no dejó sus datos. Si perdió la sesión, confirmá por Instagram que es la cuenta ganadora y generale un código de recuperación.
            </p>
          )}
          <p className={styles.muted}>
            Contactado: {when(claim.contactedAt)} · Entregado: {when(claim.deliveredAt)}
          </p>
          <div className={styles.actions}>
            {(claim.status === "PENDING" || claim.status === "CLAIMED") && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const reason = askReason("Nota del contacto (opcional):", false);
                  if (reason !== null) void run((t) => setClaimStatus(t, edition.id, "CONTACTED", reason), "Premio marcado como contactado.", "El estado del premio cambió.");
                }}
              >
                Marcar contactado
              </Button>
            )}
            {claim.status !== "DELIVERED" && (
              <Button
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("¿Marcar el premio como entregado? No se puede deshacer.")) return;
                  const reason = askReason("Nota de la entrega (opcional):", false);
                  if (reason !== null) void run((t) => setClaimStatus(t, edition.id, "DELIVERED", reason), "Premio marcado como entregado.", "El estado del premio cambió.");
                }}
              >
                Marcar entregado
              </Button>
            )}
            {claim.status === "PENDING" && winnerHandle && (
              <Button variant="secondary" disabled={busy} onClick={() => void recovery(claim.participantId, winnerHandle)}>
                Código de recuperación
              </Button>
            )}
          </div>
        </section>
      )}

      <section className={admin.section}>
        <h2 className={admin.sectionTitle}>Ranking</h2>
        <p className={styles.muted}>Mejor partida válida de cada participante. A igual puntaje, gana quien lo logró primero (hora del servidor). Solo el 1.º gana premio.</p>
        {ranking.length === 0 ? (
          <p className={styles.muted}>Todavía no hay resultados.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Instagram</th>
                  <th>Mordidas</th>
                  <th>Logrado</th>
                  <th>Intentos usados</th>
                  <th>Revisión</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ranking.map((row) => (
                  <tr key={row.participantId} className={row.position === 1 ? styles.leader : undefined}>
                    <td>{row.position}</td>
                    <td>{igLink(row.instagram)}</td>
                    <td>
                      <strong>{row.score}</strong>
                    </td>
                    <td>{when(row.achievedAt)}</td>
                    <td>
                      {row.games} de {edition.attempts}
                    </td>
                    <td>
                      <span className={styles[`review${row.review}`]}>{REVIEW_LABELS[row.review]}</span>
                      {row.flags.length > 0 && <span className={styles.flags}>{row.flags.map((f) => FLAG_LABELS[f] ?? f).join(" · ")}</span>}
                    </td>
                    <td>
                      {!published && (
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => {
                            const reason = askReason(`Motivo para descalificar a @${row.instagram} en esta edición:`);
                            if (reason) void run((t) => disqualify(t, edition.id, row.participantId, reason), `@${row.instagram} descalificado.`, "Ya estaba descalificado.");
                          }}
                        >
                          Descalificar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={admin.section}>
        <h2 className={admin.sectionTitle}>Posibles duplicados</h2>
        <p className={styles.muted}>
          Varios @ desde la misma conexión (registro o partidas). Puede ser una familia o un Wi-Fi compartido: no se bloquea a nadie. La IP no se guarda; solo una huella
          (HMAC) para comparar. Ni la IP ni el @ garantizan que sea la misma persona.
        </p>
        {alerts.length === 0 ? (
          <p className={styles.muted}>Sin coincidencias en esta edición.</p>
        ) : (
          <ul className={styles.list}>
            {alerts.map((a) => (
              <li key={a.ipHash}>
                Conexión <strong>{connectionLabel(a.ipHash)}</strong> · {a.participants.length} participantes:{" "}
                {a.participants.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 ? ", " : ""}
                    {igLink(p.instagram)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={admin.section}>
        <div className={styles.headerRow}>
          <h2 className={admin.sectionTitle}>Partidas</h2>
          <div className={styles.filters}>
            {(["suspicious", "all"] as const).map((f) => (
              <button key={f} type="button" className={styles.chip} aria-pressed={gameFilter === f} onClick={() => setGameFilter(f)}>
                {f === "suspicious" ? "Sospechosas" : "Todas (últimas 200)"}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.muted}>
          Las marcas no descalifican solas: jugar rápido no es trampa. Rechazar una partida la saca del ranking; aprobarla la confirma. El puntaje no se edita.
        </p>
        {games.length === 0 ? (
          <p className={styles.muted}>{gameFilter === "suspicious" ? "No hay partidas marcadas." : "Todavía no hay partidas."}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Inicio</th>
                  <th>Estado</th>
                  <th>Mordidas</th>
                  <th>Toques</th>
                  <th>Ritmo</th>
                  <th>Marcas</th>
                  <th>Revisión</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const r = rhythm(game.taps);
                  return (
                    <tr key={game.id}>
                      <td>
                        {igLink(game.instagram)}
                        <span className={styles.flags}>Conexión {connectionLabel(game.ipHash)}</span>
                      </td>
                      <td>
                        {when(game.startedAt)}
                        <span className={styles.flags}>
                          Intento {game.attemptNumber} de {edition.attempts}
                        </span>
                      </td>
                      <td>{game.status === "FINISHED" ? "Terminada" : game.status === "EXPIRED" ? "Vencida" : "Sin cerrar"}</td>
                      <td>
                        <strong>{game.score ?? "—"}</strong>
                      </td>
                      <td>
                        {game.tapsReceived ?? "—"}
                        {game.tapsIgnored ? <span className={styles.flags}>{game.tapsIgnored} ignorados</span> : null}
                      </td>
                      <td>{r.meanGap === null ? "—" : `${r.meanGap} ms · var. ${r.variation}%`}</td>
                      <td>
                        <span className={styles[`suspicion${game.suspicion}`]}>{game.suspicion === "NONE" ? "—" : game.suspicion === "HIGH" ? "Alta" : "Baja"}</span>
                        {game.flags.length > 0 && <span className={styles.flags}>{game.flags.map((f) => FLAG_LABELS[f] ?? f).join(" · ")}</span>}
                      </td>
                      <td>
                        <span className={styles[`review${game.review}`]}>{REVIEW_LABELS[game.review]}</span>
                        {game.reviewReason && <span className={styles.flags}>{game.reviewReason}</span>}
                      </td>
                      <td className={styles.rowActions}>
                        {game.status === "FINISHED" && !published && (
                          <>
                            <button
                              type="button"
                              className={styles.approve}
                              disabled={busy || game.review === "APPROVED"}
                              onClick={() => {
                                const reason = askReason("Motivo de la aprobación:");
                                if (reason) void run((t) => reviewGame(t, game.id, "APPROVED", reason), "Partida aprobada.", "La partida cambió.");
                              }}
                            >
                              Aprobar
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy || game.review === "REJECTED"}
                              onClick={() => {
                                const reason = askReason("Motivo del rechazo (la partida sale del ranking):");
                                if (reason) void run((t) => reviewGame(t, game.id, "REJECTED", reason), "Partida rechazada.", "La partida cambió.");
                              }}
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {disqualifications.length > 0 && (
        <section className={admin.section}>
          <h2 className={admin.sectionTitle}>Descalificados en esta edición</h2>
          <ul className={styles.list}>
            {disqualifications.map((d) => (
              <li key={d.participantId}>
                <strong>@{d.instagram}</strong> · {d.reason} · {when(d.createdAt)}
                {!published && (
                  <button
                    type="button"
                    className={styles.approve}
                    disabled={busy}
                    onClick={() => {
                      const reason = askReason(`Motivo para rehabilitar a @${d.instagram}:`);
                      if (reason) void run((t) => reinstate(t, edition.id, d.participantId, reason), `@${d.instagram} rehabilitado.`, "Ya no estaba descalificado.");
                    }}
                  >
                    Rehabilitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={admin.section}>
        <div className={styles.headerRow}>
          <h2 className={admin.sectionTitle}>Participantes</h2>
          {participants === null && (
            <Button variant="secondary" onClick={() => void loadParticipants()}>
              Ver participantes
            </Button>
          )}
        </div>
        {participants !== null && (
          <>
            <p className={styles.muted}>
              {participants.length} registrados · {participants.filter((p) => p.attemptsUsed > 0).length} jugaron esta edición ·{" "}
              {participants.filter((p) => p.duplicateAttempts > 0).length} con intentos de registro duplicado
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Instagram</th>
                    <th>Intentos usados</th>
                    <th>Mejor</th>
                    <th>Conexión</th>
                    <th>Registro duplicado</th>
                    <th>Última visita</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {igLink(p.instagram)}
                        <span className={styles.flags}>Desde {when(p.createdAt)}</span>
                      </td>
                      <td>
                        {p.attemptsUsed} de {edition.attempts}
                      </td>
                      <td>{p.best ?? "—"}</td>
                      <td>{connectionLabel(p.ipHash)}</td>
                      <td className={p.duplicateAttempts ? styles.alert : undefined}>
                        {p.duplicateAttempts ? `${p.duplicateAttempts} · último ${when(p.lastDuplicateAt)}` : "—"}
                      </td>
                      <td>{when(p.lastSeenAt)}</td>
                      <td>
                        <button type="button" className={styles.approve} disabled={busy} onClick={() => void recovery(p.id, p.instagram)}>
                          {p.recoveryPending ? "Nuevo código" : "Código de recuperación"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={admin.section}>
        <h2 className={admin.sectionTitle}>Registro de acciones</h2>
        {actions.length === 0 ? (
          <p className={styles.muted}>Sin acciones en esta edición.</p>
        ) : (
          <ul className={styles.list}>
            {actions.map((a) => (
              <li key={a.id}>
                {when(a.createdAt)} · <strong>{ACTION_LABELS[a.action] ?? a.action}</strong>
                {a.reason ? ` · ${a.reason}` : ""} <span className={styles.flags}>Admin: {a.adminUserId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
