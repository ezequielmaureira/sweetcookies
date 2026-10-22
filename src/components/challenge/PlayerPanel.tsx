"use client";

import { useState } from "react";
import type { ChallengeStatus, Me } from "@/lib/challenge/challenge-api";
import { attemptsText, bitesText, formatCountdown } from "@/lib/challenge/challenge-format";
import { FollowStep, JoinForm, RecoverForm } from "./AccessForms";
import { PrizeClaim } from "./PrizeClaim";
import shared from "./Challenge.module.css";
import styles from "./PlayerPanel.module.css";

export type Session = { status: "loading" } | { status: "none"; lost: boolean } | { status: "error" } | { status: "ready"; token: string; me: Me };

type PlayerPanelProps = {
  session: Session;
  editionStatus: ChallengeStatus | null;
  serverNow: number | null;
  /** "Seguir en Instagram" ya tocado en este navegador. */
  followed: boolean;
  imageReady: boolean;
  imageFailed: boolean;
  starting: boolean;
  playError: string | null;
  instagramHandle: string;
  onFollow: () => void;
  onPlay: () => void;
  onPractice: () => void;
  onJoined: (token: string) => void;
  onRetry: () => void;
};

/**
 * Lo que ve cada jugador: acceso (seguir + @), intentos oficiales del torneo,
 * su mejor marca, el premio si ganó y la práctica libre (siempre disponible).
 */
export function PlayerPanel(props: PlayerPanelProps) {
  const { session, editionStatus, serverNow, imageReady, imageFailed, starting, playError, instagramHandle } = props;
  const [recovering, setRecovering] = useState(false);

  const practice = (
    <div className={styles.practice}>
      <button type="button" className={shared.ghost} onClick={props.onPractice} disabled={!imageReady || imageFailed}>
        Practicar
      </button>
      <p className={styles.small}>La práctica es ilimitada, no usa intentos y no suma al ranking.</p>
    </div>
  );

  if (session.status === "loading") {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>Cargando tu participación…</p>
        {practice}
      </div>
    );
  }

  if (session.status === "error") {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>No pudimos conectar con el servidor.</p>
        <button type="button" className={shared.ghost} onClick={props.onRetry}>
          Reintentar
        </button>
        {practice}
      </div>
    );
  }

  if (session.status === "none") {
    return (
      <div className={styles.panel}>
        {session.lost && (
          <p className={styles.warning} role="status">
            Este navegador ya no tiene tu participación. Si ya jugabas, escribinos por Instagram a {instagramHandle} y te damos un código para recuperarla.
          </p>
        )}
        {recovering ? (
          <RecoverForm instagramHandle={instagramHandle} onJoined={props.onJoined} onBack={() => setRecovering(false)} />
        ) : props.followed ? (
          <JoinForm onJoined={props.onJoined} onRecover={() => setRecovering(true)} />
        ) : (
          <FollowStep instagramHandle={instagramHandle} onFollow={props.onFollow} />
        )}
        {practice}
      </div>
    );
  }

  const { me, token } = session;
  const active = editionStatus === "ACTIVE";
  const nextIn = serverNow === null ? null : Date.parse(me.edition.nextStartsAt) - serverNow;

  return (
    <div className={styles.panel}>
      <p className={styles.hello}>
        Hola, <strong>{me.participant.handle}</strong>
      </p>

      {me.claims.map((claim) => (
        <PrizeClaim key={claim.editionId} token={token} claim={claim} prize={me.edition.prize} onClaimed={props.onRetry} />
      ))}

      {me.best ? (
        <p className={styles.best}>
          Tu mejor marca: <strong>{bitesText(me.best.score)}</strong> · Puesto <strong>#{me.best.position}</strong> de {me.ranked}
        </p>
      ) : (
        <p className={styles.best}>Todavía no tenés resultados en esta edición.</p>
      )}

      {me.disqualified ? (
        <p className={styles.warning}>Tu participación en esta edición está suspendida. Si creés que es un error, escribinos.</p>
      ) : !active ? null : me.attempts.left > 0 ? (
        <>
          <p className={styles.attempts}>{attemptsText(me.attempts.left)}</p>
          <button type="button" className={`${shared.cta} ${styles.play}`} onClick={props.onPlay} disabled={starting || !imageReady || imageFailed}>
            {starting ? "Preparando…" : imageReady ? "Jugar partida oficial" : imageFailed ? "Sin foto" : "Horneando…"}
          </button>
          <p className={styles.small}>Son {me.attempts.limit} intentos para toda la semana. Cada partida oficial que empieza usa uno, aunque salgas antes.</p>
        </>
      ) : (
        <>
          <p className={styles.attempts}>Ya usaste tus {me.attempts.limit} intentos oficiales de esta semana.</p>
          <p className={styles.reset}>
            Nuevos intentos con la próxima edición, en <strong>{nextIn === null ? "…" : formatCountdown(nextIn)}</strong>
          </p>
        </>
      )}

      {playError && (
        <p className={styles.warning} role="alert">
          {playError}
        </p>
      )}

      {practice}
    </div>
  );
}
