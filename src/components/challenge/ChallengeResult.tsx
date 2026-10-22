"use client";

import { useEffect, useRef } from "react";
import type { FinishResponse } from "@/lib/challenge/challenge-api";
import { attemptsText, bitesText, cookiesText } from "@/lib/challenge/challenge-format";
import { SharePanel } from "./SharePanel";
import shared from "./Challenge.module.css";
import styles from "./ChallengeResult.module.css";

export type ResultState = { status: "sending" } | { status: "done"; response: FinishResponse } | { status: "failed"; definitive: boolean };

type ChallengeResultProps = {
  /** Lo que contó el navegador: se muestra solo mientras valida el servidor. */
  local: { bites: number; cookies: number };
  state: ResultState;
  /** Sesión del jugador (para su enlace personal de invitación). */
  token: string | null;
  starting: boolean;
  onReplay: () => void;
  onRetry: () => void;
  onRanking: () => void;
  onHome: () => void;
};

function verdict(bites: number) {
  if (bites === 0) return "¡La cookie te estaba esperando!";
  if (bites < 60) return "Buen arranque. ¡Seguro podés más!";
  if (bites < 120) return "¡Eso es tener hambre!";
  if (bites < 180) return "¡Qué velocidad! Pocos llegan ahí.";
  return "¡Sos una máquina de comer cookies!";
}

/**
 * Resultado de una partida oficial (siempre validado por el servidor). Después
 * de jugar se destaca "Desafiá a tus amigos" con el puntaje que confirmó el
 * servidor (nunca el que contó el navegador).
 */
export function ChallengeResult({ local, state, token, starting, onReplay, onRetry, onRanking, onHome }: ChallengeResultProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Foco al título: el lector de pantalla anuncia el resultado.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const done = state.status === "done" ? state.response : null;
  const bites = done ? done.result.score : local.bites;
  const cookies = done ? done.result.cookies : local.cookies;
  const canReplay = done !== null && done.attempts.left > 0 && done.tournament.status === "ACTIVE";
  const exhausted = done !== null && done.attempts.left === 0;
  // Para invitar se usa la mejor marca validada; si todavía no hay (por ejemplo, partida rechazada), la de esta partida.
  const shareScore = done ? (done.result.best?.score ?? done.result.score) : null;

  return (
    <main id="contenido" className={styles.result}>
      <div className={styles.inner}>
        <p className={styles.mode}>{done?.tournament.name ?? "Partida oficial"}</p>
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          ¡Se terminó!
        </h1>

        {done?.result.newRecord && <p className={`${styles.banner} ${styles.record}`}>¡Nuevo récord personal!</p>}
        {done?.result.enteredTop10 && <p className={`${styles.banner} ${styles.top}`}>¡Entraste al Top 10!</p>}

        <div className={styles.card} aria-busy={state.status === "sending"}>
          <p className={styles.score}>
            <span className={styles.scoreLabel}>Conseguiste</span>
            <span className={styles.scoreValue}>{bites}</span>
            <span className={styles.scoreLabel}>{bites === 1 ? "mordida" : "mordidas"}</span>
          </p>
          <p className={styles.cookies}>
            Te comiste <strong>{cookiesText(cookies)}</strong>
          </p>

          {state.status === "sending" && <p className={styles.checking}>Validando tu resultado…</p>}

          {done && (
            <dl className={styles.facts}>
              <div>
                <dt>Tu mejor marca</dt>
                <dd>{done.result.best ? bitesText(done.result.best.score) : "—"}</dd>
              </div>
              <div>
                <dt>Puesto</dt>
                <dd>{done.result.best ? `#${done.result.best.position} de ${done.result.ranked}` : "—"}</dd>
              </div>
              <div>
                <dt>Intentos</dt>
                <dd>{done.attempts.left > 0 ? attemptsText(done.attempts.left, done.attempts.limit) : `Usaste los ${done.attempts.limit} de este torneo`}</dd>
              </div>
            </dl>
          )}
        </div>

        {state.status === "failed" ? (
          <p className={styles.error} role="alert">
            {state.definitive
              ? "No pudimos validar esta partida (venció o ya no es válida). Si creés que es un error, escribinos."
              : "No pudimos enviar tu resultado. Revisá tu conexión: lo guardamos en este celular y lo vamos a reintentar."}
          </p>
        ) : exhausted ? (
          <p className={styles.exhausted}>¡YA USASTE TODOS TUS INTENTOS!</p>
        ) : (
          <p className={styles.verdict}>{verdict(bites)}</p>
        )}

        {done && done.tournament.status !== "CANCELLED" && (
          <div className={styles.share}>
            <SharePanel tournament={done.tournament} kind="record" score={shareScore} token={token} prominent title={exhausted ? "Desafiá a tus amigos" : "🍪 Desafiá a tus amigos"} />
          </div>
        )}

        <div className={styles.actions}>
          {state.status === "failed" && !state.definitive && (
            <button type="button" className={shared.cta} onClick={onRetry}>
              Reintentar envío
            </button>
          )}
          {canReplay && (
            <button type="button" className={shared.cta} onClick={onReplay} disabled={starting}>
              {starting ? "Preparando…" : "Jugar otra vez"}
            </button>
          )}
          <button type="button" className={shared.ghost} onClick={onRanking} disabled={state.status === "sending"}>
            Ver ranking
          </button>
          <button type="button" className={shared.ghost} onClick={onHome} disabled={state.status === "sending"}>
            Volver al inicio
          </button>
        </div>

        <p className={styles.note}>
          {canReplay ? `Jugar otra vez usa un intento: ${attemptsText(done.attempts.left, done.attempts.limit).toLowerCase()}. ` : ""}El puntaje lo calcula el servidor. El
          ganador se confirma al cierre del torneo, después de revisar los resultados.
        </p>
      </div>
    </main>
  );
}
