"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { STATUS_LABELS, getOverview, listEditions, type AdminEdition, type EditionListItem, type Overview } from "@/lib/admin/challenge-admin-api";
import { formatCordobaDateTime } from "@/lib/challenge/challenge-format";
import admin from "@/components/admin/Admin.module.css";
import { TournamentActions } from "./TournamentActions";
import { TournamentForm } from "./TournamentForm";
import { TournamentManage } from "./TournamentManage";
import styles from "./ChallengeAdmin.module.css";

type View = { name: "home" } | { name: "form"; edition: AdminEdition | null } | { name: "manage"; id: string };

type Group = "all" | "drafts" | "scheduled" | "active" | "paused" | "finished";

const GROUPS: { id: Group; label: string; match: (e: AdminEdition) => boolean }[] = [
  { id: "all", label: "Todos", match: () => true },
  { id: "drafts", label: "Borradores", match: (e) => e.status === "DRAFT" || e.status === "UNPUBLISHED" },
  { id: "scheduled", label: "Programados", match: (e) => e.status === "SCHEDULED" },
  { id: "active", label: "Activos", match: (e) => e.status === "ACTIVE" },
  { id: "paused", label: "Pausados", match: (e) => e.status === "PAUSED" },
  { id: "finished", label: "Finalizados", match: (e) => e.status === "FINISHED" || e.status === "RESULTS_PUBLISHED" || e.status === "CANCELLED" },
];

const when = (iso: string | null) => (iso ? formatCordobaDateTime(iso) : "—");

/**
 * Centro de administración de torneos del Sweet Click Challenge. Todos los
 * torneos son reales. Crear guarda un borrador; PUBLICAR es una decisión
 * explícita del admin. Publicado = visible; activo = publicado y dentro de sus
 * fechas (lo calcula el servidor). Los eliminados salen del listado y no
 * bloquean fechas.
 */
export function ChallengeAdmin() {
  const { getToken, isLoaded } = useAuth();
  const [view, setView] = useState<View>({ name: "home" });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [editions, setEditions] = useState<EditionListItem[] | null>(null);
  const [group, setGroup] = useState<Group>("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const done = (message: string) => {
    setNotice(message);
    void reload();
  };

  if (error && !overview) return <p className={admin.error}>{error}</p>;
  if (!overview || !editions) return <p className={styles.muted}>Cargando torneos…</p>;

  if (view.name === "form") {
    return (
      <TournamentForm
        edition={view.edition}
        limits={overview.limits}
        serverNow={Date.parse(overview.serverNow)}
        onCancel={() => setView({ name: "home" })}
        onDone={(saved) => {
          setNotice(`«${saved.name}» guardado · ${STATUS_LABELS[saved.status]}${saved.published ? "" : " (no visible al público)"}.`);
          void reload();
          setView({ name: "manage", id: saved.id });
        }}
      />
    );
  }

  if (view.name === "manage") {
    return (
      <TournamentManage
        key={view.id}
        id={view.id}
        onBack={() => setView({ name: "home" })}
        onEdit={(edition) => setView({ name: "form", edition })}
        onChanged={() => void reload()}
        onDeleted={(message) => {
          setNotice(message);
          void reload();
          setView({ name: "home" });
        }}
      />
    );
  }

  const { live, next, liveStats } = overview;
  const current = editions.filter((e) => !e.deletedAt);
  const deleted = editions.filter((e) => e.deletedAt);
  const visible = current.filter(GROUPS.find((g) => g.id === group)!.match);

  return (
    <div className={styles.stack}>
      {!overview.ipTracking && (
        <section className={`${admin.section} ${styles.testMode}`}>
          <p className={styles.alertText}>Sin CHALLENGE_IP_SECRET en el servidor: no se registran conexiones y no hay alertas por IP.</p>
        </section>
      )}

      {/* Resumen */}
      <section className={admin.section}>
        <h2 className={admin.sectionTitle}>Resumen</h2>
        <div className={styles.summary}>
          <button type="button" className={styles.summaryCard} disabled={!live} onClick={() => live && setView({ name: "manage", id: live.id })}>
            <span className={styles.summaryLabel}>Torneo activo</span>
            <strong>{live ? live.name : "Ninguno"}</strong>
            <span className={styles.flags}>{live ? `${STATUS_LABELS[live.status]} · termina ${when(live.endsAt)}` : "No hay ningún torneo en juego"}</span>
          </button>
          <button type="button" className={styles.summaryCard} disabled={!next} onClick={() => next && setView({ name: "manage", id: next.id })}>
            <span className={styles.summaryLabel}>Próximo publicado</span>
            <strong>{next ? next.name : "Ninguno"}</strong>
            <span className={styles.flags}>{next ? `Empieza ${when(next.startsAt)}` : "Creá uno con “+ Crear torneo” y publicalo"}</span>
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
            <dt>Partidas para revisar</dt>
            <dd className={liveStats?.pendingReview ? styles.alert : undefined}>{live ? (liveStats?.pendingReview ?? 0) : "—"}</dd>
          </div>
          <div>
            <dt>Ganadores por confirmar</dt>
            <dd className={overview.pendingWinners ? styles.alert : undefined}>{overview.pendingWinners}</dd>
          </div>
        </dl>
      </section>

      {/* Torneos */}
      <section className={admin.section}>
        <div className={styles.headerRow}>
          <h2 className={admin.sectionTitle}>Torneos</h2>
          <Button onClick={() => setView({ name: "form", edition: null })}>+ Crear torneo</Button>
        </div>
        <p className={styles.muted}>
          Crear un torneo lo guarda como borrador (no se ve). Se muestra en /campeonato solo cuando tocás “Publicar torneo”, y se puede jugar desde su fecha de inicio.
          Dos torneos publicados no pueden superponerse; los borradores, despublicados y eliminados no bloquean fechas.
        </p>
        <div className={styles.statusTabs} role="group" aria-label="Filtrar por estado">
          {GROUPS.map((g) => (
            <button key={g.id} type="button" className={styles.chip} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
              {g.label} ({current.filter(g.match).length})
            </button>
          ))}
        </div>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {visible.length === 0 ? (
          <p className={styles.muted}>{current.length === 0 ? "Todavía no hay torneos. Mientras no publiques uno, /campeonato muestra “Próximamente, nuevo desafío”." : "No hay torneos en este estado."}</p>
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
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <TournamentRow
                    key={e.id}
                    edition={e}
                    previewOpen={preview === e.id}
                    onPreview={() => setPreview((p) => (p === e.id ? null : e.id))}
                    onManage={() => setView({ name: "manage", id: e.id })}
                    onEdit={() => setView({ name: "form", edition: e })}
                    onDone={done}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Eliminados */}
      <section className={admin.section}>
        <div className={styles.headerRow}>
          <h2 className={admin.sectionTitle}>Eliminados ({deleted.length})</h2>
          {deleted.length > 0 && (
            <button type="button" className={styles.chip} aria-pressed={showDeleted} onClick={() => setShowDeleted((v) => !v)}>
              {showDeleted ? "Ocultar" : "Mostrar"}
            </button>
          )}
        </div>
        <p className={styles.muted}>Torneos con actividad que se eliminaron: no se ven, no bloquean fechas y no aceptan partidas ni reclamos. Se conservan para auditoría.</p>
        {showDeleted && (
          <ul className={styles.list}>
            {deleted.map((e) => (
              <li key={e.id}>
                <strong>{e.name}</strong>
                {e.legacy && <span className={styles.tagLegacy}>Histórico de prueba</span>} · {when(e.startsAt)} → {when(e.endsAt)} · {e.participants} participantes ·{" "}
                {e.games} partidas · eliminado {when(e.deletedAt)}
                {e.deleteReason ? ` · ${e.deleteReason}` : ""}{" "}
                <button type="button" className={styles.approve} onClick={() => setView({ name: "manage", id: e.id })}>
                  Ver historial
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type RowProps = {
  edition: EditionListItem;
  previewOpen: boolean;
  onPreview: () => void;
  onManage: () => void;
  onEdit: () => void;
  onDone: (message: string) => void;
};

function TournamentRow({ edition: e, previewOpen, onPreview, onManage, onEdit, onDone }: RowProps) {
  return (
    <>
      <tr>
        <td>
          <strong>{e.name}</strong>
          {e.legacy ? (
            <span className={styles.tagLegacy}>Histórico de prueba</span>
          ) : e.published ? (
            <span className={styles.tagPublished}>Publicado</span>
          ) : (
            <span className={styles.tagHidden}>No visible</span>
          )}
          <button type="button" className={styles.linkButton} onClick={onPreview} aria-expanded={previewOpen}>
            {previewOpen ? "Ocultar detalle" : "Ver detalle"}
          </button>
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
        <td>
          <TournamentActions edition={e} compact onManage={onManage} onEdit={onEdit} onDone={onDone} />
        </td>
      </tr>
      {previewOpen && (
        <tr>
          <td colSpan={7}>
            <div className={styles.rowPreview}>
              {e.description && <p className={styles.preLine}>{e.description}</p>}
              <p>
                Premio del 1.º puesto: <strong>{e.prize}</strong>
                {e.legacy ? " (histórico de prueba: sin premio)" : ""}
              </p>
              {e.prizeDescription && <p className={styles.preLine}>{e.prizeDescription}</p>}
              <p className={styles.muted}>
                {e.attempts} intentos por participante · {e.games} partidas · {e.participants} participantes
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
