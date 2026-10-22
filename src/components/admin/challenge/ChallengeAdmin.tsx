"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import {
  STATUS_LABELS,
  TournamentApiError,
  cancelTournament,
  getOverview,
  listEditions,
  scheduleTournament,
  type AdminEdition,
  type EditionListItem,
  type Overview,
} from "@/lib/admin/challenge-admin-api";
import { formatCordobaDateTime } from "@/lib/challenge/challenge-format";
import admin from "@/components/admin/Admin.module.css";
import { TournamentForm } from "./TournamentForm";
import { TournamentManage } from "./TournamentManage";
import styles from "./ChallengeAdmin.module.css";

type View = { name: "home" } | { name: "form"; edition: AdminEdition | null } | { name: "manage"; id: string };

const when = (iso: string | null) => (iso ? formatCordobaDateTime(iso) : "—");
const editable = (e: AdminEdition) => e.status === "DRAFT" || e.status === "SCHEDULED" || e.status === "ACTIVE" || e.status === "PAUSED";
const cancellable = (e: AdminEdition) => e.status !== "CANCELLED" && e.status !== "RESULTS_PUBLISHED";

/**
 * Centro de administración de torneos del Sweet Click Challenge: resumen,
 * listado, crear/editar (con vista previa) y administrar cada torneo. No hay
 * calendario fijo: cada torneo tiene las fechas, el premio y los intentos que
 * define el admin, y se activa y finaliza solo según sus fechas.
 */
export function ChallengeAdmin() {
  const { getToken, isLoaded } = useAuth();
  const [view, setView] = useState<View>({ name: "home" });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [editions, setEditions] = useState<EditionListItem[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const token = await getToken();
      const [nextOverview, nextEditions] = await Promise.all([getOverview(token), listEditions(token)]);
      setOverview(nextOverview);
      setEditions(nextEditions);
      setError(null);
    } catch (e) {
      setError(adminErrorMessage(e, "No pudimos cargar los torneos."));
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [isLoaded, reload]);

  const act = async (action: (token: string | null) => Promise<unknown>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action(await getToken());
      setNotice(done);
      await reload();
    } catch (e) {
      setNotice(e instanceof TournamentApiError && e.serverMessage ? e.serverMessage : e instanceof AdminApiError && e.status === 409 ? "El torneo cambió: recargá." : adminErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const schedule = (e: AdminEdition) => {
    if (!window.confirm(`¿Programar «${e.name}»? Quedará visible en /campeonato y se activará solo el ${when(e.startsAt)}.`)) return;
    void act((t) => scheduleTournament(t, e.id), `«${e.name}» programado.`);
  };

  const cancel = (e: AdminEdition) => {
    if (!window.confirm(`¿Cancelar «${e.name}»? Deja de aceptar partidas y no se puede deshacer. Se conserva todo el historial.`)) return;
    const reason = window.prompt("Motivo de la cancelación (queda registrado):")?.trim() ?? "";
    if (reason.length < 3) {
      if (reason) window.alert("El motivo es obligatorio (mínimo 3 caracteres).");
      return;
    }
    void act((t) => cancelTournament(t, e.id, reason), `«${e.name}» cancelado. Se conservan sus resultados.`);
  };

  if (error && !overview) return <p className={admin.error}>{error}</p>;
  if (!overview || !editions) return <p className={styles.muted}>Cargando torneos…</p>;

  if (view.name === "form") {
    return (
      <TournamentForm
        edition={view.edition}
        officialAllowed={overview.officialAllowed}
        limits={overview.limits}
        serverNow={Date.parse(overview.serverNow)}
        onCancel={() => setView({ name: "home" })}
        onDone={(saved) => {
          setNotice(`«${saved.name}» guardado · ${STATUS_LABELS[saved.status]}.`);
          void reload();
          setView({ name: "manage", id: saved.id });
        }}
      />
    );
  }

  if (view.name === "manage") {
    return <TournamentManage key={view.id} id={view.id} onBack={() => setView({ name: "home" })} onEdit={(edition) => setView({ name: "form", edition })} onChanged={() => void reload()} />;
  }

  const { live, next, liveStats } = overview;

  return (
    <div className={styles.stack}>
      {(!overview.officialAllowed || !overview.ipTracking) && (
        <section className={`${admin.section} ${styles.testMode}`}>
          {!overview.officialAllowed && (
            <p>
              <strong>Torneos oficiales bloqueados en el servidor.</strong> Podés crear y programar torneos de prueba, y preparar oficiales como borrador. Para publicar
              oficiales hace falta CHALLENGE_MODE=official.
            </p>
          )}
          {!overview.ipTracking && <p className={styles.alertText}>Sin CHALLENGE_IP_SECRET en el servidor: no se registran conexiones y no hay alertas por IP.</p>}
        </section>
      )}

      {/* A. Resumen */}
      <section className={admin.section}>
        <h2 className={admin.sectionTitle}>Resumen</h2>
        <div className={styles.summary}>
          <button type="button" className={styles.summaryCard} disabled={!live} onClick={() => live && setView({ name: "manage", id: live.id })}>
            <span className={styles.summaryLabel}>Torneo activo</span>
            <strong>{live ? live.name : "Ninguno"}</strong>
            <span className={styles.flags}>{live ? `${STATUS_LABELS[live.status]} · termina ${when(live.endsAt)}` : "No hay competencia oficial en este momento"}</span>
          </button>
          <button type="button" className={styles.summaryCard} disabled={!next} onClick={() => next && setView({ name: "manage", id: next.id })}>
            <span className={styles.summaryLabel}>Próximo programado</span>
            <strong>{next ? next.name : "Ninguno"}</strong>
            <span className={styles.flags}>{next ? `Empieza ${when(next.startsAt)}` : "Creá uno con “+ Crear torneo”"}</span>
          </button>
        </div>
        <dl className={styles.stats}>
          <div>
            <dt>Participantes (activo)</dt>
            <dd>{liveStats?.participants ?? "—"}</dd>
          </div>
          <div>
            <dt>Partidas (activo)</dt>
            <dd>{liveStats?.games ?? "—"}</dd>
          </div>
          <div>
            <dt>Alertas pendientes</dt>
            <dd className={overview.liveAlerts + (liveStats?.pendingReview ?? 0) ? styles.alert : undefined}>{live ? overview.liveAlerts + (liveStats?.pendingReview ?? 0) : "—"}</dd>
          </div>
          <div>
            <dt>Ganadores por confirmar</dt>
            <dd className={overview.pendingWinners ? styles.alert : undefined}>{overview.pendingWinners}</dd>
          </div>
        </dl>
        {live && (overview.liveAlerts > 0 || (liveStats?.pendingReview ?? 0) > 0) && (
          <p className={styles.muted}>
            Alertas: {overview.liveAlerts} conexiones compartidas · {liveStats?.pendingReview ?? 0} partidas para revisar.
          </p>
        )}
      </section>

      {/* B. Torneos */}
      <section className={admin.section}>
        <div className={styles.headerRow}>
          <h2 className={admin.sectionTitle}>Torneos</h2>
          <Button onClick={() => setView({ name: "form", edition: null })}>+ Crear torneo</Button>
        </div>
        <p className={styles.muted}>Un solo torneo a la vez: las fechas de los torneos programados no se pueden superponer. Los borradores no se ven en la página.</p>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {editions.length === 0 ? (
          <p className={styles.muted}>Todavía no hay torneos. Mientras no haya uno programado, /campeonato muestra “Próximamente, nuevo desafío” y la práctica.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Inicio → Finalización</th>
                  <th>Estado</th>
                  <th>Premio</th>
                  <th>Intentos</th>
                  <th>Participantes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {editions.map((e) => (
                  <TournamentRow
                    key={e.id}
                    edition={e}
                    busy={busy}
                    previewOpen={preview === e.id}
                    onPreview={() => setPreview((p) => (p === e.id ? null : e.id))}
                    onManage={() => setView({ name: "manage", id: e.id })}
                    onEdit={() => setView({ name: "form", edition: e })}
                    onSchedule={() => schedule(e)}
                    onCancel={() => cancel(e)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type RowProps = {
  edition: EditionListItem;
  busy: boolean;
  previewOpen: boolean;
  onPreview: () => void;
  onManage: () => void;
  onEdit: () => void;
  onSchedule: () => void;
  onCancel: () => void;
};

function TournamentRow({ edition: e, busy, previewOpen, onPreview, onManage, onEdit, onSchedule, onCancel }: RowProps) {
  return (
    <>
      <tr>
        <td>
          <strong>{e.name}</strong>
          <span className={e.isTest ? styles.tagTest : styles.tagOfficial}>{e.isTest ? "Prueba" : "Oficial"}</span>
        </td>
        <td>
          {when(e.startsAt)}
          <span className={styles.flags}>→ {when(e.endsAt)}</span>
        </td>
        <td>
          <span className={styles[`status${e.status}`]}>{STATUS_LABELS[e.status]}</span>
        </td>
        <td>{e.prize}</td>
        <td>{e.attempts}</td>
        <td>{e.participants}</td>
        <td className={styles.rowActions}>
          <button type="button" className={styles.approve} onClick={onPreview} aria-expanded={previewOpen}>
            Ver
          </button>
          {editable(e) && (
            <button type="button" className={styles.approve} disabled={busy} onClick={onEdit}>
              Editar
            </button>
          )}
          {e.status === "DRAFT" && (
            <button type="button" className={styles.approve} disabled={busy} onClick={onSchedule}>
              Programar
            </button>
          )}
          {cancellable(e) && (
            <button type="button" className={styles.danger} disabled={busy} onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button type="button" className={styles.approve} onClick={onManage}>
            Administrar
          </button>
        </td>
      </tr>
      {previewOpen && (
        <tr>
          <td colSpan={7}>
            <div className={styles.rowPreview}>
              {e.description && <p className={styles.preLine}>{e.description}</p>}
              <p>
                Premio del 1.º puesto: <strong>{e.prize}</strong>
                {e.isTest ? " (prueba: no es real)" : ""}
              </p>
              {e.prizeDescription && <p className={styles.preLine}>{e.prizeDescription}</p>}
              <p className={styles.muted}>
                {e.attempts} intentos por participante · {e.games} partidas · {e.participants} participantes
              </p>
              {e.cancelReason && <p className={styles.alertText}>Cancelado: {e.cancelReason}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
