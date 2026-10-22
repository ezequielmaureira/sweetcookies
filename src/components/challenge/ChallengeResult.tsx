"use client";

import { useEffect, useRef } from "react";
import type { FinishResponse } from "@/lib/challenge/challenge-api";
import { attemptsText, bitesText, cookiesText } from "@/lib/challenge/challenge-format";
import shared from "./Challenge.module.css";
import styles from "./ChallengeResult.module.css";

export type ResultState = { status: "sending" } | { status: "done"; response: FinishResponse } | { status: "failed"; definitive: boolean };

type ChallengeResultProps = {
  /** Lo que contó el navegador: se muestra solo mientras valida el servidor. */
  local: { bites: number; cookies: number };
  /** Práctica: no se envía al servidor ni suma al ranking. */
  practice: boolean;
  state: ResultState;
  starting: boolean;
  onReplay: () => void;
  onPractice: () => void;
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

export function ChallengeResult({ local, practice, state, starting, onReplay, onPractice, onRetry, onRanking, onHome }: ChallengeResultProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Foco al título: el lector de pantalla anuncia el resultado.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const done = !practice && state.status === "done" ? state.response : null;
  const bites = done ? done.result.score : local.bites;
  const cookies = done ? done.result.cookies : local.cookies;
  const canReplay = done !== null && done.attempts.left > 0 && done.edition.status === "ACTIVE";

  return (
    <main id="contenido" className={styles.result}>
      <div className={styles.inner}>
        <p className={`${styles.mode} ${practice ? styles.modePractice : ""}`}>{practice ? "Práctica · no suma al ranking" : "Partida oficial"}</p>
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

          {!practice && state.status === "sending" && <p className={styles.checking}>Validando tu resultado…</p>}

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
                <dd>{done.attempts.left > 0 ? attemptsText(done.attempts.left) : "Usaste los 3 de esta semana"}</dd>
              </div>
            </dl>
          )}
        </div>

        {!practice && state.status === "failed" ? (
          <p className={styles.error} role="alert">
            {state.definitive
              ? "No pudimos validar esta partida (venció o ya no es válida). Si creés que es un error, escribinos."
              : "No pudimos enviar tu resultado. Revisá tu conexión: lo guardamos en este celular y lo vamos a reintentar."}
          </p>
        ) : (
          <p className={styles.verdict}>{verdict(bites)}</p>
        )}

        <div className={styles.actions}>
          {!practice && state.status === "failed" && !state.definitive && (
            <button type="button" className={shared.cta} onClick={onRetry}>
              Reintentar envío
            </button>
          )}
          {canReplay && (
            <button type="button" className={shared.cta} onClick={onReplay} disabled={starting}>
              {starting ? "Preparando…" : "Jugar otra partida oficial"}
            </button>
          )}
          {(practice || (done !== null && !canReplay)) && (
            <button type="button" className={practice ? shared.cta : shared.ghost} onClick={onPractice}>
              {practice ? "Practicar de nuevo" : "Seguir practicando"}
            </button>
          )}
          <button type="button" className={shared.ghost} onClick={onRanking} disabled={!practice && state.status === "sending"}>
            Ver ranking
          </button>
          <button type="button" className={shared.ghost} onClick={onHome} disabled={!practice && state.status === "sending"}>
            Volver al inicio
          </button>
        </div>

        <p className={styles.note}>
          {practice
            ? "Las prácticas son ilimitadas y no cuentan para el campeonato."
            : "El puntaje lo calcula el servidor. El ganador se confirma el sábado, después de revisar los resultados."}
        </p>
      </div>
    </main>
  );
}
