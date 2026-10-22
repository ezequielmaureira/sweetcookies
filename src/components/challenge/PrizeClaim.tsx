"use client";

import { useId, useState } from "react";
import { ChallengeApiError, claimPrize, type PrizeClaim as Claim } from "@/lib/challenge/challenge-api";
import shared from "./Challenge.module.css";
import styles from "./ChallengeForm.module.css";

type PrizeClaimProps = {
  token: string;
  /** Premio del torneo que ganó (cada torneo tiene el suyo). */
  claim: Claim;
  onClaimed: () => void;
};

/**
 * Premio del primer puesto CONFIRMADO. Recién acá se piden nombre y celular,
 * solo para coordinar la entrega. El reclamo va atado a la sesión del ganador.
 */
export function PrizeClaim({ token, claim, onClaimed }: PrizeClaimProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const testNote = claim.isTest ? <p className={styles.help}>Torneo de prueba: este premio no es real.</p> : null;

  if (claim.status !== "PENDING") {
    return (
      <div className={styles.form}>
        <p className={styles.success} role="status">
          🏆 ¡Ganaste «{claim.tournamentName}»! Ya recibimos tus datos: te vamos a contactar para coordinar la entrega.
        </p>
        {testNote}
      </div>
    );
  }

  if (!open) {
    return (
      <div className={styles.form}>
        <p className={styles.success}>
          ¡Ganaste «{claim.tournamentName}»! Tu premio: <strong>{claim.prize}</strong>.
          {claim.prizeDescription ? ` ${claim.prizeDescription}` : ""}
        </p>
        {testNote}
        <button type="button" className={`${shared.cta} ${styles.submit}`} onClick={() => setOpen(true)}>
          🏆 Reclamá tu premio
        </button>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setMessage(null);
    try {
      await claimPrize(token, claim.editionId, { name, phone });
      onClaimed();
    } catch (error) {
      if (error instanceof ChallengeApiError && error.status === 422) setErrors(error.fields);
      else if (error instanceof ChallengeApiError && error.status === 409) onClaimed();
      else setMessage("No pudimos enviar tus datos. Probá de nuevo en unos segundos.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h3 className={styles.title}>🏆 Reclamá tu premio</h3>
      {testNote}
      <div className={styles.field}>
        <label htmlFor={`${id}-name`} className={styles.label}>
          Nombre
        </label>
        <input id={`${id}-name`} className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} aria-invalid={Boolean(errors.name) || undefined} />
        {errors.name && <p className={styles.error}>{errors.name}</p>}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-phone`} className={styles.label}>
          Celular / WhatsApp
        </label>
        <input
          id={`${id}-phone`}
          className={styles.input}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="358 412-3456"
          maxLength={24}
          aria-invalid={Boolean(errors.phone) || undefined}
        />
        {errors.phone && <p className={styles.error}>{errors.phone}</p>}
      </div>
      <p className={styles.notice}>
        Privacidad: usamos tu nombre y tu celular solo para coordinar la entrega del premio. No se publican ni se comparten.
      </p>
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
      <button type="submit" className={`${shared.cta} ${styles.submit}`} disabled={sending}>
        {sending ? "Enviando…" : "Enviar mis datos"}
      </button>
    </form>
  );
}
