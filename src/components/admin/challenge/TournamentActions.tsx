"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useState } from "react";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import {
  CLAIM_LABELS,
  TournamentApiError,
  deleteTournament,
  finishTournament,
  getDeletionInfo,
  pauseTournament,
  publishTournament,
  resumeTournament,
  unpublishTournament,
  type AdminEdition,
  type DeletionInfo,
} from "@/lib/admin/challenge-admin-api";
import { formatCordobaDateTime } from "@/lib/challenge/challenge-format";
import styles from "./ChallengeAdmin.module.css";

type TournamentActionsProps = {
  edition: AdminEdition;
  /** Muestra también Administrar (en el listado). */
  onManage?: () => void;
  onEdit?: () => void;
  /** Mensaje para el admin y recarga. `deleted` = el torneo ya no está en el listado principal. */
  onDone: (message: string, deleted?: boolean) => void;
  compact?: boolean;
};

const ask = (question: string): string | null => {
  const answer = window.prompt(question);
  return answer === null ? null : answer.trim();
};

/** Qué acciones tiene un torneo según su estado (el servidor vuelve a validar todo). */
export function availableActions(e: AdminEdition) {
  const deleted = e.deletedAt !== null;
  const s = e.status;
  return {
    edit: !deleted && !e.legacy && ["DRAFT", "UNPUBLISHED", "SCHEDULED", "ACTIVE", "PAUSED"].includes(s),
    publish: !deleted && !e.legacy && (s === "DRAFT" || s === "UNPUBLISHED"),
    unpublish: !deleted && (s === "SCHEDULED" || s === "ACTIVE" || s === "PAUSED"),
    pause: !deleted && s === "ACTIVE",
    resume: !deleted && !e.legacy && s === "PAUSED",
    finish: !deleted && (s === "ACTIVE" || s === "PAUSED"),
    remove: !deleted,
  };
}

/**
 * Botones de un torneo: Editar, Publicar, Despublicar, Pausar, Reanudar,
 * Finalizar, Administrar y Eliminar. Publicar es siempre una decisión explícita.
 * Eliminar muestra qué tiene el torneo y pide escribir ELIMINAR.
 */
export function TournamentActions({ edition: e, onManage, onEdit, onDone, compact = false }: TournamentActionsProps) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const can = availableActions(e);

  const run = async (action: (token: string | null) => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action(await getToken());
      onDone(done);
    } catch (error) {
      onDone(error instanceof TournamentApiError && error.serverMessage ? error.serverMessage : adminErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const publish = () => {
    const when = Date.parse(e.startsAt) > Date.now() ? `Se verá en /campeonato y se podrá jugar desde el ${formatCordobaDateTime(e.startsAt)}.` : "Se verá en /campeonato y se podrá jugar ya mismo.";
    if (!window.confirm(`¿Publicar «${e.name}»? ${when}`)) return;
    void run((t) => publishTournament(t, e.id), `«${e.name}» publicado.`);
  };
  const unpublish = () => {
    if (!window.confirm(`¿Despublicar «${e.name}»? Deja de verse y de aceptar partidas. Se conservan participantes y resultados, y podés volver a publicarlo.`)) return;
    const reason = ask("Motivo (opcional):");
    if (reason === null) return;
    void run((t) => unpublishTournament(t, e.id, reason), `«${e.name}» despublicado.`);
  };
  const pause = () => {
    const reason = ask("Motivo de la pausa (obligatorio, queda registrado):");
    if (reason === null) return;
    if (reason.length < 3) return void window.alert("El motivo es obligatorio (mínimo 3 caracteres).");
    void run((t) => pauseTournament(t, e.id, reason), `«${e.name}» pausado: no acepta partidas nuevas.`);
  };
  const resume = () => void run((t) => resumeTournament(t, e.id), `«${e.name}» reanudado.`);
  const finish = () => {
    if (!window.confirm(`¿Finalizar «${e.name}» ahora? No acepta más partidas y queda listo para confirmar al ganador. No se puede deshacer.`)) return;
    const reason = ask("Motivo (opcional):");
    if (reason === null) return;
    void run((t) => finishTournament(t, e.id, reason), `«${e.name}» finalizado. Revisá los resultados y confirmá al ganador.`);
  };

  const button = (label: string, onClick: () => void, danger = false) => (
    <button type="button" className={danger ? styles.danger : styles.approve} disabled={busy} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <>
      <div className={compact ? styles.rowActions : styles.actionBar}>
        {can.publish && (
          <button type="button" className={styles.publish} disabled={busy} onClick={publish}>
            Publicar torneo
          </button>
        )}
        {can.edit && onEdit && button("Editar", onEdit)}
        {can.pause && button("Pausar", pause)}
        {can.resume && button("Reanudar", resume)}
        {can.finish && button("Finalizar", finish)}
        {can.unpublish && button("Despublicar", unpublish)}
        {onManage && button("Administrar", onManage)}
        {can.remove && button("Eliminar", () => setDeleting(true), true)}
      </div>
      {deleting && (
        <DeleteDialog
          edition={e}
          onClose={() => setDeleting(false)}
          onDeleted={(mode) => {
            setDeleting(false);
            onDone(mode === "hard" ? `«${e.name}» eliminado definitivamente.` : `«${e.name}» eliminado. Su historial queda en "Eliminados".`, true);
          }}
        />
      )}
    </>
  );
}

/** Confirmación de borrado: qué tiene el torneo, advertencias y escribir ELIMINAR. */
function DeleteDialog({ edition: e, onClose, onDeleted }: { edition: AdminEdition; onClose: () => void; onDeleted: (mode: "hard" | "soft") => void }) {
  const { getToken } = useAuth();
  const id = useId();
  const [info, setInfo] = useState<DeletionInfo | null>(null);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Qué tiene el torneo (participantes, partidas, ganador, premio) antes de confirmar.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const next = await getDeletionInfo(await getToken(), e.id);
        if (alive) setInfo(next);
      } catch (err) {
        if (alive) setError(adminErrorMessage(err, "No pudimos revisar el torneo."));
      }
    })();
    return () => {
      alive = false;
    };
  }, [getToken, e.id]);

  const remove = async () => {
    if (confirm !== "ELIMINAR" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteTournament(await getToken(), e.id, reason.trim());
      onDeleted(result.mode);
    } catch (err) {
      setError(err instanceof TournamentApiError && err.serverMessage ? err.serverMessage : adminErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className={styles.dialogBackdrop} role="presentation" onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={(event) => event.stopPropagation()}>
        <h3 id={`${id}-title`} className={styles.dialogTitle}>
          Eliminar «{e.name}»
        </h3>
        {!info && !error && <p className={styles.muted}>Revisando el torneo…</p>}
        {info && (
          <>
            <p>
              {info.participants} participantes · {info.games} partidas · {info.invites} enlaces de invitación · {info.referrals} registros referidos
            </p>
            {info.mode === "hard" ? (
              <p className={styles.muted}>No tiene actividad: se va a borrar definitivamente.</p>
            ) : (
              <p className={styles.alertText}>
                Tiene actividad: se va a quitar del listado y de la página, y dejará de bloquear fechas. No se borran participantes, partidas, resultados ni
                reclamos: quedan en la sección “Eliminados” para auditoría. No se podrán jugar partidas ni reclamar premios de este torneo.
              </p>
            )}
            {info.winnerPublished && <p className={styles.alertText}>⚠ Este torneo tiene un ganador publicado.</p>}
            {info.claimStatus && <p className={styles.alertText}>⚠ Premio: {CLAIM_LABELS[info.claimStatus]}. Si todavía no lo entregaste, coordinalo antes de eliminar.</p>}
            <label className={styles.dialogField}>
              <span>Motivo (opcional)</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
            </label>
            <label className={styles.dialogField}>
              <span>
                Escribí <strong>ELIMINAR</strong> para confirmar
              </span>
              <input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" autoCapitalize="characters" />
            </label>
          </>
        )}
        {error && (
          <p className={styles.alertText} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actionBar}>
          <button type="button" className={styles.approve} onClick={onClose} disabled={busy}>
            Volver
          </button>
          <button type="button" className={styles.danger} onClick={() => void remove()} disabled={!info || confirm !== "ELIMINAR" || busy}>
            {busy ? "Eliminando…" : "Eliminar torneo"}
          </button>
        </div>
      </div>
    </div>
  );
}
