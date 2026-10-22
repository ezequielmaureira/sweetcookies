"use client";

import { useAuth } from "@clerk/nextjs";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import {
  TournamentApiError,
  createTournament,
  scheduleTournament,
  updateTournament,
  type AdminEdition,
  type TournamentForm as Form,
} from "@/lib/admin/challenge-admin-api";
import { formatCordobaDateTime } from "@/lib/challenge/challenge-format";
import admin from "@/components/admin/Admin.module.css";
import styles from "./ChallengeAdmin.module.css";

type TournamentFormProps = {
  /** null = torneo nuevo. */
  edition: AdminEdition | null;
  officialAllowed: boolean;
  limits: { minAttempts: number; maxAttempts: number };
  serverNow: number;
  onDone: (edition: AdminEdition) => void;
  onCancel: () => void;
};

const fromEdition = (e: AdminEdition): Form => ({
  name: e.name,
  description: e.description ?? "",
  startDate: e.start.date,
  startTime: e.start.time,
  endDate: e.end.date,
  endTime: e.end.time,
  prize: e.prize,
  prizeDescription: e.prizeDescription ?? "",
  attempts: e.attempts,
  mode: e.isTest ? "test" : "official",
});

const EMPTY: Form = {
  name: "",
  description: "",
  startDate: "",
  startTime: "18:00",
  endDate: "",
  endTime: "23:59",
  prize: "",
  prizeDescription: "",
  attempts: 3,
  mode: "test",
};

/** Fecha y hora del formulario como instante (solo para la vista previa; el servidor valida en hora de Córdoba). */
const previewDate = (date: string, time: string) => (date && time ? new Date(`${date}T${time}:00-03:00`).toISOString() : null);

/**
 * Crear o editar un torneo: nombre, descripción, fechas y horas (Córdoba),
 * premio, intentos y modo, con vista previa de lo que verá el jugador. El
 * servidor valida todo (fechas, superposición y reglas de edición) y responde
 * con el motivo si algo no se puede.
 */
export function TournamentForm({ edition, officialAllowed, limits, serverNow, onDone, onCancel }: TournamentFormProps) {
  const { getToken } = useAuth();
  const id = useId();
  const [form, setForm] = useState<Form>(edition ? fromEdition(edition) : EMPTY);
  const [reason, setReason] = useState("");
  const [confirmPrize, setConfirmPrize] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDraft = !edition || edition.status === "DRAFT";
  // Ya empezó (o tiene partidas: el servidor lo vuelve a comprobar): inicio y modo fijos.
  const started = !!edition && !isDraft && (Date.parse(edition.startsAt) <= serverNow || edition.status === "ACTIVE" || edition.status === "PAUSED");
  const prizeChanged = !!edition && (form.prize.trim() !== edition.prize || form.prizeDescription.trim() !== (edition.prizeDescription ?? ""));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (schedule: boolean) => {
    if (busy) return;
    if (schedule && !window.confirm("¿Programar el torneo? Quedará visible en /campeonato y se activará solo en su fecha de inicio.")) return;
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      const token = await getToken();
      let saved: AdminEdition;
      if (!edition) {
        saved = await createTournament(token, form, schedule);
      } else {
        saved = await updateTournament(token, edition.id, form, { reason: reason.trim() || undefined, confirmPrizeChange: confirmPrize });
        if (schedule && saved.status === "DRAFT") saved = await scheduleTournament(token, edition.id);
      }
      onDone(saved);
    } catch (e) {
      if (e instanceof TournamentApiError) {
        setErrors(e.fields);
        setMessage(e.serverMessage ?? (e.status === 422 ? "Revisá los campos marcados." : adminErrorMessage(e)));
      } else {
        setMessage(adminErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Form, label: string, input: React.ReactNode, help?: string) => (
    <div className={admin.field}>
      <label htmlFor={`${id}-${key}`} className={admin.label}>
        {label}
      </label>
      {input}
      {errors[key] ? <p className={admin.error}>{errors[key]}</p> : help ? <p className={admin.help}>{help}</p> : null}
    </div>
  );
  const dateError = (key: "start" | "end") => (errors[key] ? <p className={admin.error}>{errors[key]}</p> : null);

  const startIso = previewDate(form.startDate, form.startTime);
  const endIso = previewDate(form.endDate, form.endTime);

  return (
    <div className={styles.formLayout}>
      <section className={admin.section}>
        <div className={styles.headerRow}>
          <h2 className={admin.sectionTitle}>{edition ? `Editar «${edition.name}»` : "Crear torneo"}</h2>
          <button type="button" className={styles.backLink} onClick={onCancel}>
            ← Volver
          </button>
        </div>
        {started && (
          <p className={styles.alertText}>
            Este torneo ya empezó: el inicio y el modo quedan fijos, el cierre solo se puede extender, los intentos solo pueden aumentar y cambiar el premio exige
            confirmación. Cada cambio pide un motivo y queda registrado.
          </p>
        )}

        <form className={styles.formGrid} onSubmit={(e) => e.preventDefault()} noValidate>
          {field(
            "name",
            "Nombre del torneo",
            <input id={`${id}-name`} className={admin.input} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="Desafío Halloween" aria-invalid={!!errors.name || undefined} />,
          )}
          {field(
            "description",
            "Descripción (opcional)",
            <textarea id={`${id}-description`} className={admin.input} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={500} rows={3} />,
          )}

          <fieldset className={styles.dateRow} disabled={started}>
            <legend className={admin.label}>Inicio (hora de Córdoba)</legend>
            <input type="date" className={admin.input} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} aria-label="Fecha de inicio" aria-invalid={!!errors.start || undefined} />
            <input type="time" className={admin.input} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} aria-label="Hora de inicio" aria-invalid={!!errors.start || undefined} />
            {dateError("start")}
          </fieldset>
          <fieldset className={styles.dateRow}>
            <legend className={admin.label}>Finalización (hora de Córdoba)</legend>
            <input type="date" className={admin.input} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} aria-label="Fecha de finalización" aria-invalid={!!errors.end || undefined} />
            <input type="time" className={admin.input} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="Hora de finalización" aria-invalid={!!errors.end || undefined} />
            {dateError("end")}
            <p className={admin.help}>El cierre incluye ese minuto completo (23:59 = hasta 23:59:59). Puede durar desde 15 minutos hasta 90 días.</p>
          </fieldset>

          {field(
            "prize",
            "Premio para el primer puesto",
            <input id={`${id}-prize`} className={admin.input} value={form.prize} onChange={(e) => set("prize", e.target.value)} maxLength={120} placeholder="Caja de 6 cookies" aria-invalid={!!errors.prize || undefined} />,
          )}
          {field(
            "prizeDescription",
            "Descripción del premio (opcional)",
            <textarea id={`${id}-prizeDescription`} className={admin.input} value={form.prizeDescription} onChange={(e) => set("prizeDescription", e.target.value)} maxLength={500} rows={2} />,
          )}
          {field(
            "attempts",
            "Intentos por participante",
            <input
              id={`${id}-attempts`}
              type="number"
              inputMode="numeric"
              className={admin.input}
              min={started && edition ? edition.attempts : limits.minAttempts}
              max={limits.maxAttempts}
              step={1}
              value={Number.isFinite(form.attempts) ? form.attempts : ""}
              onChange={(e) => set("attempts", e.target.value === "" ? Number.NaN : Number(e.target.value))}
              aria-invalid={!!errors.attempts || undefined}
            />,
            `Entre ${limits.minAttempts} y ${limits.maxAttempts}. Son para todo el torneo (no se renuevan por día).`,
          )}

          <fieldset className={styles.modeRow} disabled={!isDraft}>
            <legend className={admin.label}>Modo</legend>
            <label className={styles.radio}>
              <input type="radio" name={`${id}-mode`} checked={form.mode === "test"} onChange={() => set("mode", "test")} />
              <span>
                <strong>Prueba</strong> · sin premio real; resultados separados de los oficiales
              </span>
            </label>
            <label className={styles.radio}>
              <input type="radio" name={`${id}-mode`} checked={form.mode === "official"} onChange={() => set("mode", "official")} />
              <span>
                <strong>Oficial</strong> · premio real
              </span>
            </label>
            {errors.mode && <p className={admin.error}>{errors.mode}</p>}
            {form.mode === "official" && !officialAllowed && (
              <p className={styles.alertText}>El servidor todavía no permite publicar torneos oficiales (CHALLENGE_MODE=official). Podés guardarlo como borrador.</p>
            )}
            {!isDraft && <p className={admin.help}>El modo solo se cambia en borrador.</p>}
          </fieldset>

          {edition && !isDraft && (
            <div className={admin.field}>
              <label htmlFor={`${id}-reason`} className={admin.label}>
                Motivo del cambio{started ? "" : " (opcional)"}
              </label>
              <input id={`${id}-reason`} className={admin.input} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Queda en el historial" />
              {errors.reason && <p className={admin.error}>{errors.reason}</p>}
            </div>
          )}
          {started && prizeChanged && (
            <label className={styles.radio}>
              <input type="checkbox" checked={confirmPrize} onChange={(e) => setConfirmPrize(e.target.checked)} />
              <span>Confirmo el cambio de premio de un torneo en curso (los jugadores verán el premio nuevo).</span>
            </label>
          )}

          {message && (
            <p className={admin.error} role="alert">
              {message}
            </p>
          )}

          <div className={styles.actions}>
            {isDraft && (
              <Button variant="secondary" disabled={busy} onClick={() => void submit(false)}>
                {busy ? "Guardando…" : "Guardar borrador"}
              </Button>
            )}
            <Button disabled={busy} onClick={() => void submit(isDraft)}>
              {busy ? "Guardando…" : isDraft ? "Programar torneo" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </section>

      <aside className={styles.previewWrap} aria-label="Vista previa para el jugador">
        <p className={admin.help}>Vista previa: así lo verá el jugador en /campeonato.</p>
        <div className={styles.preview}>
          {form.mode === "test" && <p className={styles.previewTest}>Torneo de prueba: los resultados no son oficiales y no hay premio real.</p>}
          <p className={styles.previewLead}>¡Competí por {form.prize.trim() ? form.prize.trim().charAt(0).toLowerCase() + form.prize.trim().slice(1) : "…"}!</p>
          <p className={styles.previewLabel}>{form.name.trim() || "Nombre del torneo"}</p>
          <p className={styles.previewPrize}>
            🏆 Premio para el 1.º puesto: <strong>{form.prize.trim() || "—"}</strong>
          </p>
          {form.prizeDescription.trim() && <p className={styles.previewSub}>{form.prizeDescription.trim()}</p>}
          {form.description.trim() && <p className={styles.previewText}>{form.description.trim()}</p>}
          <p className={styles.previewSub}>
            Empieza: {startIso ? formatCordobaDateTime(startIso) : "—"}
            <br />
            Termina: {endIso ? formatCordobaDateTime(endIso) : "—"}
          </p>
          <p className={styles.previewAttempts}>
            Te quedan {Number.isFinite(form.attempts) ? form.attempts : "—"} de {Number.isFinite(form.attempts) ? form.attempts : "—"} intentos en este torneo
          </p>
          <span className={styles.previewButton}>Jugar</span>
          <span className={styles.previewGhost}>🍪 Invitá a tus amigos</span>
        </div>
      </aside>
    </div>
  );
}
