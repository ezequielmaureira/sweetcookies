"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChallengeApiError, loadRef, recoverSession, register, updateContact } from "@/lib/challenge/challenge-api";
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
      <p className={styles.lead}>Seguí a {instagramHandle} y después dejanos tu @, tu nombre y tu WhatsApp para competir por el premio.</p>
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

/** Lo que se explica antes de pedir nombre y WhatsApp. */
function PrizeExplainer() {
  return (
    <>
      <h3 className={styles.title}>🏆 ¡PARTICIPÁ POR EL PREMIO!</h3>
      <p className={styles.lead}>Dejanos tu nombre y WhatsApp para que podamos avisarte si resultás ganador del desafío.</p>
      <p className={styles.notice}>Tus datos serán utilizados únicamente para gestionar el campeonato y contactarte si ganás. No se mostrarán públicamente.</p>
    </>
  );
}

type ContactFieldsProps = {
  id: string;
  name: string;
  phone: string;
  terms: boolean;
  errors: Record<string, string>;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onTerms: (value: boolean) => void;
};

/** Nombre y apellido, WhatsApp y aceptación de las bases y del tratamiento de datos. */
function ContactFields({ id, name, phone, terms, errors, onName, onPhone, onTerms }: ContactFieldsProps) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${id}-name`} className={styles.label}>
          Nombre y apellido
        </label>
        <input
          id={`${id}-name`}
          className={styles.input}
          value={name}
          onChange={(e) => onName(e.target.value)}
          autoComplete="name"
          maxLength={60}
          required
          aria-invalid={Boolean(errors.name) || undefined}
          aria-describedby={`${id}-name-note`}
        />
        <p id={`${id}-name-note`} className={errors.name ? styles.error : styles.help}>
          {errors.name ?? "No se publica: solo lo vemos nosotros."}
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-phone`} className={styles.label}>
          WhatsApp
        </label>
        <input
          id={`${id}-phone`}
          className={styles.input}
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="358 412-3456"
          maxLength={24}
          required
          aria-invalid={Boolean(errors.phone) || undefined}
          aria-describedby={`${id}-phone-note`}
        />
        <p id={`${id}-phone-note`} className={errors.phone ? styles.error : styles.help}>
          {errors.phone ?? "Con código de área. Si no es de Argentina, empezá con + y el código de país."}
        </p>
      </div>
      <div className={styles.checkField}>
        <label className={styles.check}>
          <input type="checkbox" checked={terms} onChange={(e) => onTerms(e.target.checked)} aria-invalid={Boolean(errors.terms) || undefined} />
          <span>
            Acepto las{" "}
            <Link href="/campeonato/bases" target="_blank" className={styles.link}>
              bases y condiciones
            </Link>{" "}
            y el uso de mis datos para gestionar el campeonato y contactarme si gano.
          </span>
        </label>
        {errors.terms && <p className={styles.error}>{errors.terms}</p>}
      </div>
    </>
  );
}

/** Controles mínimos antes de enviar (el servidor valida y normaliza todo). */
function precheck(fields: { instagram?: string; name: string; phone: string; terms: boolean }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (fields.instagram !== undefined && !fields.instagram.trim()) errors.instagram = "Escribí tu usuario de Instagram (ej. @tuusuario).";
  if (fields.name.trim().split(/\s+/).filter(Boolean).length < 2) errors.name = "Escribí tu nombre y apellido.";
  if (fields.phone.replace(/\D/g, "").length < 8) errors.phone = "Escribí tu WhatsApp con código de área.";
  if (!fields.terms) errors.terms = "Tenés que aceptar las bases y condiciones y el uso de tus datos.";
  return errors;
}

/** Paso 2: @ de Instagram, nombre y apellido y WhatsApp (sin contraseña). */
export function JoinForm({ onJoined, onRecover }: { onJoined: (token: string) => void; onRecover: () => void }) {
  const id = useId();
  const [instagram, setInstagram] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const local = precheck({ instagram, name, phone, terms });
    setErrors(local);
    if (Object.keys(local).length) return;
    setSending(true);
    setMessage(null);
    try {
      // Si llegó por un enlace de invitación, se manda el código: solo mide la difusión, no da ventajas.
      const { token } = await register(instagram, { name, phone, terms }, loadRef());
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
      <PrizeExplainer />

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

      <ContactFields id={id} name={name} phone={phone} terms={terms} errors={errors} onName={setName} onPhone={setPhone} onTerms={setTerms} />

      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}

      <button type="submit" className={`${shared.cta} ${styles.submit}`} disabled={sending}>
        {sending ? "Entrando…" : "Participar"}
      </button>
      <p className={styles.help}>Sin contraseña: este navegador queda registrado para tus partidas oficiales.</p>
      <button type="button" className={styles.textButton} onClick={onRecover}>
        ¿Ya participabas en otro celular? Tengo un código
      </button>
    </form>
  );
}

type ContactFormProps = {
  token: string;
  /** "missing" = participante anterior sin datos (obligatorio para jugar); "update" = corregirlos. */
  mode: "missing" | "update";
  onSaved: () => void;
  onCancel?: () => void;
};

/**
 * Datos de contacto del propio participante: los deja (si se registró antes de
 * este requisito) o los corrige. Solo con su sesión; no toca intentos ni
 * puntajes. Por seguridad se escriben de nuevo enteros (nunca se muestra el
 * número guardado).
 */
export function ContactForm({ token, mode, onSaved, onCancel }: ContactFormProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const local = precheck({ name, phone, terms });
    setErrors(local);
    if (Object.keys(local).length) return;
    setSending(true);
    setMessage(null);
    try {
      await updateContact(token, { name, phone, terms });
      onSaved();
    } catch (error) {
      if (error instanceof ChallengeApiError && error.status === 422) setErrors(error.fields);
      else setMessage(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {mode === "missing" ? (
        <>
          <PrizeExplainer />
          <p className={styles.help}>Para seguir jugando, completá estos datos. Tus intentos y tus resultados se conservan.</p>
        </>
      ) : (
        <>
          <h3 className={styles.title}>Actualizar mis datos</h3>
          <p className={styles.lead}>Escribí de nuevo tu nombre y tu WhatsApp. Tus intentos y tus resultados no cambian.</p>
        </>
      )}
      <ContactFields id={id} name={name} phone={phone} terms={terms} errors={errors} onName={setName} onPhone={setPhone} onTerms={setTerms} />
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
      <button type="submit" className={`${shared.cta} ${styles.submit}`} disabled={sending}>
        {sending ? "Guardando…" : mode === "missing" ? "Guardar y seguir" : "Guardar mis datos"}
      </button>
      {onCancel && (
        <button type="button" className={styles.textButton} onClick={onCancel}>
          Volver
        </button>
      )}
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
