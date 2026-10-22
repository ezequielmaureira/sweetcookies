"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChallengeApiError, recoverSession, register } from "@/lib/challenge/challenge-api";
import { instagramUrl } from "@/lib/challenge/challenge-format";
import shared from "./Challenge.module.css";
import styles from "./ChallengeForm.module.css";

/**
 * Paso 1: "Seguinos y participá". El botón abre el Instagram oficial y habilita
 * la participación; no se comprueba si la persona siguió la cuenta.
 */
export function FollowStep({ instagramHandle, onFollow }: { instagramHandle: string; onFollow: () => void }) {
  return (
    <div className={styles.form}>
      <h3 className={styles.title}>SEGUINOS Y PARTICIPÁ</h3>
      <p className={styles.lead}>Seguí a {instagramHandle} y después escribí tu @ para competir por el premio de la semana.</p>
      <a className={`${shared.cta} ${styles.submit}`} href={instagramUrl(instagramHandle)} target="_blank" rel="noopener noreferrer" onClick={onFollow}>
        Seguir en Instagram
      </a>
    </div>
  );
}

const messageFor = (error: unknown) =>
  error instanceof ChallengeApiError && error.status === 429
    ? "Demasiados intentos desde esta conexión. Probá más tarde."
    : "No pudimos conectar con el servidor. Probá de nuevo en unos segundos.";

/** Paso 2: solo el @ de Instagram (sin contraseña ni otros datos). */
export function JoinForm({ onJoined, onRecover }: { onJoined: (token: string) => void; onRecover: () => void }) {
  const id = useId();
  const [instagram, setInstagram] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setMessage(null);
    try {
      const { token } = await register(instagram, terms);
      onJoined(token);
    } catch (error) {
      if (error instanceof ChallengeApiError && (error.status === 422 || error.status === 409)) setErrors(error.fields);
      else setMessage(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h3 className={styles.title}>Tu @ para competir</h3>
      <p className={styles.lead}>Sin contraseña: este navegador queda registrado para tus partidas oficiales.</p>

      <div className={styles.field}>
        <label htmlFor={`${id}-ig`} className={styles.label}>
          Usuario de Instagram
        </label>
        <input
          id={`${id}-ig`}
          className={styles.input}
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="@tuusuario"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={60}
          required
          aria-invalid={Boolean(errors.instagram) || undefined}
          aria-describedby={`${id}-ig-note`}
        />
        <p id={`${id}-ig-note`} className={errors.instagram ? styles.error : styles.help}>
          {errors.instagram ?? "Se muestra en el ranking. Usá tu propio @: el ganador tiene que poder confirmarlo."}
        </p>
      </div>

      <div className={styles.checkField}>
        <label className={styles.check}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={Boolean(errors.terms) || undefined} />
          <span>
            Acepto las{" "}
            <Link href="/campeonato/bases" target="_blank" className={styles.link}>
              bases y condiciones
            </Link>
            .
          </span>
        </label>
        {errors.terms && <p className={styles.error}>{errors.terms}</p>}
      </div>

      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}

      <button type="submit" className={`${shared.cta} ${styles.submit}`} disabled={sending}>
        {sending ? "Entrando…" : "Participar"}
      </button>
      <button type="button" className={styles.textButton} onClick={onRecover}>
        ¿Ya participabas en otro celular? Tengo un código
      </button>
    </form>
  );
}

/** Recuperación manual: el código lo genera Sweet Cookies y lo manda por Instagram. */
export function RecoverForm({ instagramHandle, onJoined, onBack }: { instagramHandle: string; onJoined: (token: string) => void; onBack: () => void }) {
  const id = useId();
  const [instagram, setInstagram] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setMessage(null);
    try {
      const { token } = await recoverSession(instagram, code);
      onJoined(token);
    } catch (error) {
      setMessage(error instanceof ChallengeApiError && error.status === 422 ? "El @ o el código no son válidos, o el código venció." : messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h3 className={styles.title}>Recuperar mi participación</h3>
      <p className={styles.lead}>Escribinos por Instagram a {instagramHandle} desde tu cuenta y te mandamos un código de un solo uso.</p>
      <div className={styles.field}>
        <label htmlFor={`${id}-ig`} className={styles.label}>
          Usuario de Instagram
        </label>
        <input id={`${id}-ig`} className={styles.input} value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@tuusuario" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={60} />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-code`} className={styles.label}>
          Código
        </label>
        <input id={`${id}-code`} className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCDE-FGH23" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={14} />
      </div>
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
      <button type="submit" className={`${shared.cta} ${styles.submit}`} disabled={sending}>
        {sending ? "Verificando…" : "Recuperar"}
      </button>
      <button type="button" className={styles.textButton} onClick={onBack}>
        Volver
      </button>
    </form>
  );
}
