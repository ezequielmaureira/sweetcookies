"use client";

import { useEffect, useRef } from "react";
import shared from "./Challenge.module.css";
import styles from "./ChallengeResult.module.css";

type ChallengeResultProps = {
  bites: number;
  cookies: number;
  onReplay: () => void;
  onHome: () => void;
};

function verdict(bites: number) {
  if (bites === 0) return "¡La cookie te estaba esperando!";
  if (bites < 60) return "Buen arranque. ¡Seguro podés más!";
  if (bites < 120) return "¡Eso es tener hambre!";
  if (bites < 180) return "¡Qué velocidad! Pocos llegan ahí.";
  return "¡Sos una máquina de comer cookies!";
}

export function ChallengeResult({ bites, cookies, onReplay, onHome }: ChallengeResultProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Foco al título: el lector de pantalla anuncia el resultado.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <main id="contenido" className={styles.result}>
      <div className={styles.inner}>
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          ¡Se terminó!
        </h1>

        <div className={styles.card}>
          <p className={styles.score}>
            <span className={styles.scoreLabel}>Conseguiste</span>
            <span className={styles.scoreValue}>{bites}</span>
            <span className={styles.scoreLabel}>{bites === 1 ? "mordida" : "mordidas"}</span>
          </p>
          <p className={styles.cookies}>
            Te comiste{" "}
            <strong>
              {cookies} {cookies === 1 ? "cookie" : "cookies"}
            </strong>
          </p>
        </div>

        <p className={styles.verdict}>{verdict(bites)}</p>

        <div className={styles.actions}>
          <button type="button" className={shared.cta} onClick={onReplay}>
            Volver a jugar
          </button>
          <button type="button" className={shared.ghost} onClick={onHome}>
            Volver al inicio
          </button>
        </div>

        <p className={styles.note}>Versión demo: este resultado no se guarda ni participa de ningún campeonato.</p>
      </div>
    </main>
  );
}
