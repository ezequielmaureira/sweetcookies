"use client";

import { useAuth } from "@clerk/nextjs";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import {
  TournamentApiError,
  createTournament,
  updateTournament,
  type AdminEdition,
  type TournamentForm as Form,
} from "@/lib/admin/challenge-admin-api";
import { uploadProductImage } from "@/lib/admin/product-upload";
import { resolveImageSrc } from "@/lib/catalog";
import { formatCordobaDateTime } from "@/lib/challenge/challenge-format";
import admin from "@/components/admin/Admin.module.css";
import styles from "./ChallengeAdmin.module.css";

type TournamentFormProps = {
  /** null = torneo nuevo. */
  edition: AdminEdition | null;
  limits: { minAttempts: number; maxAttempts: number; minParticipants: number; maxParticipants: number };
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
  prizeImageUrl: e.prizeImageUrl,
  attempts: e.attempts,
  // Un borrador anterior a la regla arranca con el sugerido; uno ya publicado sin mínimo lo conserva.
  minParticipants: e.minParticipants ?? (e.status === "DRAFT" ? 2 : null),
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
  prizeImageUrl: null,
  attempts: 3,
  minParticipants: 2,
};

/** Fecha y hora del formulario como instante (solo para la vista previa; el servidor valida en hora de Córdoba). */
const previewDate = (date: string, time: string) => (date && time ? new Date(`${date}T${time}:00-03:00`).toISOString() : null);

/**
 * Crear o editar un torneo: nombre, descripción, fechas y horas (Córdoba),
 * premio (con foto opcional) e intentos, con vista previa de lo que verá el jugador. El
 * servidor valida todo (fechas, superposición y reglas de edición) y responde
 * con el motivo si algo no se puede.
 */
export function TournamentForm({ edition, limits, serverNow, onDone, onCancel }: TournamentFormProps) {
  const { getToken } = useAuth();
  const id = useId();
  const [form, setForm] = useState<Form>(edition ? fromEdition(edition) : EMPTY);
  const [reason, setReason] = useState("");
  const [confirmPrize, setConfirmPrize] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Borrador o despublicado: no visible al público.
  const isDraft = !edition || edition.status === "DRAFT" || edition.status === "UNPUBLISHED";
  // Ya empezó (o tiene partidas: el servidor lo vuelve a comprobar): inicio y modo fijos.
  const started = !!edition && !isDraft && (Date.parse(edition.startsAt) <= serverNow || edition.status === "ACTIVE" || edition.status === "PAUSED");
  // El mínimo es una condición anunciada: solo se cambia mientras el torneo es borrador.
  const minEditable = !edition || edition.status === "DRAFT";
  const prizeChanged = !!edition && (form.prize.trim() !== edition.prize || form.prizeDescription.trim() !== (edition.prizeDescription ?? ""));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Foto del premio: se reduce en el navegador y se sube con el mismo sistema que las fotos de productos.
  // Queda asociada al torneo al guardar.
  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setErrors((e) => ({ ...e, prizeImage: "" }));
    const result = await uploadProductImage(getToken, file, "main");
    setUploading(false);
    if ("error" in result) setErrors((e) => ({ ...e, prizeImage: result.error }));
    else set("prizeImageUrl", result.url);
  };
  const photoSrc = resolveImageSrc(form.prizeImageUrl);

  // Guardar NUNCA publica: el torneo nuevo queda en borrador y se publica aparte.
  const submit = async () => {
    if (busy) return;
    // Vacío viajaría como null (= no enviado): se pide explícitamente.
    if (form.minParticipants !== null && !Number.isInteger(form.minParticipants)) {
      setErrors({ minParticipants: `Elegí un mínimo entre ${limits.minParticipants} y ${limits.maxParticipants} participantes.` });
      setMessage("Revisá los campos marcados.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      const token = await getToken();
      let saved: AdminEdition;
      if (!edition) saved = await createTournament(token, form);
      else saved = await updateTournament(token, edition.id, form, { reason: reason.trim() || undefined, confirmPrizeChange: confirmPrize });
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
            Este torneo ya empezó: el inicio queda fijo, el cierre solo se puede extender, los intentos solo pueden aumentar y cambiar el premio exige
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
          <div className={admin.field}>
            <span className={admin.label}>Foto del premio (opcional)</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" tabIndex={-1} onChange={uploadPhoto} aria-hidden="true" />
            {photoSrc ? (
              <div className={styles.prizePhotoEdit}>
                {/* eslint-disable-next-line @next/next/no-img-element -- foto subida, servida por la API */}
                <img src={photoSrc} alt="Foto del premio" className={styles.prizePhotoThumb} />
                <div className={styles.rowActions}>
                  <button type="button" className={styles.approve} disabled={uploading || busy} onClick={() => fileRef.current?.click()}>
                    {uploading ? "Subiendo…" : "Cambiar foto"}
                  </button>
                  <button type="button" className={styles.danger} disabled={uploading || busy} onClick={() => set("prizeImageUrl", null)}>
                    Quitar foto
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.rowActions}>
                <button type="button" className={styles.approve} disabled={uploading || busy} onClick={() => fileRef.current?.click()}>
                  {uploading ? "Subiendo…" : "Subir foto del premio"}
                </button>
              </div>
            )}
            {errors.prizeImage ? (
              <p className={admin.error}>{errors.prizeImage}</p>
            ) : (
              <p className={admin.help}>JPG, PNG o WebP. Se muestra entera, sin recortes. Sin foto, la página queda como siempre. Los cambios se guardan al tocar “Guardar”.</p>
            )}
          </div>
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


          <div className={admin.field}>
            <label htmlFor={`${id}-minParticipants`} className={admin.label}>
              Mínimo de participantes
            </label>
            {form.minParticipants === null ? (
              <p className={admin.help}>Sin mínimo: este torneo es anterior a la regla y se conserva tal como se publicó.</p>
            ) : (
              <input
                id={`${id}-minParticipants`}
                type="number"
                inputMode="numeric"
                className={admin.input}
                min={limits.minParticipants}
                max={limits.maxParticipants}
                step={1}
                disabled={!minEditable}
                value={Number.isFinite(form.minParticipants) ? form.minParticipants : ""}
                onChange={(e) => set("minParticipants", e.target.value === "" ? Number.NaN : Number(e.target.value))}
                aria-invalid={!!errors.minParticipants || undefined}
              />
            )}
            {errors.minParticipants ? (
              <p className={admin.error}>{errors.minParticipants}</p>
            ) : (
              <p className={admin.help}>
                El premio se entrega únicamente si se alcanza este mínimo de participantes válidos. Entre {limits.minParticipants} y {limits.maxParticipants}.
                Cuentan personas con al menos una partida válida (no intentos ni registros).{" "}
                {minEditable ? "Se puede cambiar mientras sea borrador." : "Ya se publicó: no se puede cambiar."}
              </p>
            )}
          </div>

          {edition && edition.status !== "DRAFT" && (
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
            <Button disabled={busy || uploading} onClick={() => void submit()}>
              {busy ? "Guardando…" : !edition ? "Guardar borrador" : "Guardar cambios"}
            </Button>
          </div>
          <p className={admin.help}>
            {!edition || isDraft
              ? "Guardar no publica: el torneo queda sin mostrarse. Cuando quieras, tocá “Publicar torneo” en su administración o en el listado."
              : "El torneo está publicado: los cambios se ven enseguida en /campeonato."}
          </p>
        </form>
      </section>

      <aside className={styles.previewWrap} aria-label="Vista previa para el jugador">
        <p className={admin.help}>Vista previa: así lo verá el jugador en /campeonato.</p>
        <div className={styles.preview}>
          <p className={styles.previewLead}>¡Competí por {form.prize.trim() ? form.prize.trim().charAt(0).toLowerCase() + form.prize.trim().slice(1) : "…"}!</p>
          <p className={styles.previewLabel}>{form.name.trim() || "Nombre del torneo"}</p>
          <p className={styles.previewPrize}>
            🏆 Premio para el 1.º puesto: <strong>{form.prize.trim() || "—"}</strong>
          </p>
          {photoSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- foto subida, servida por la API
            <img src={photoSrc} alt="Foto del premio" className={styles.previewPhoto} />
          )}
          {form.prizeDescription.trim() && <p className={styles.previewSub}>{form.prizeDescription.trim()}</p>}
          {form.description.trim() && <p className={styles.previewText}>{form.description.trim()}</p>}
          <p className={styles.previewSub}>
            Empieza: {startIso ? formatCordobaDateTime(startIso) : "—"}
            <br />
            Termina: {endIso ? formatCordobaDateTime(endIso) : "—"}
          </p>
          {form.minParticipants !== null && Number.isFinite(form.minParticipants) && (
            <p className={styles.previewSub}>El premio se entrega solo si participan al menos {form.minParticipants} personas con una partida válida.</p>
          )}
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
