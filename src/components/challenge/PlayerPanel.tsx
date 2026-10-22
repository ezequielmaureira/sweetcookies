"use client";

import { useState } from "react";
import type { Me, Tournament } from "@/lib/challenge/challenge-api";
import { attemptsText, bitesText, instagramUrl } from "@/lib/challenge/challenge-format";
import { ContactForm, FollowStep, JoinForm, RecoverForm } from "./AccessForms";
import { PrizeClaim } from "./PrizeClaim";
import { SharePanel } from "./SharePanel";
import shared from "./Challenge.module.css";
import formStyles from "./ChallengeForm.module.css";
import styles from "./PlayerPanel.module.css";

export type Session = { status: "loading" } | { status: "none"; lost: boolean } | { status: "error" } | { status: "ready"; token: string; me: Me };

type PlayerPanelProps = {
  session: Session;
  /** Torneo que muestra la página (null = sin torneo). Su estado lo calcula el servidor. */
  tournament: Tournament | null;
  /** "Seguir en Instagram" ya tocado en este navegador. */
  followed: boolean;
  imageReady: boolean;
  imageFailed: boolean;
  starting: boolean;
  playError: string | null;
  instagramHandle: string;
  onFollow: () => void;
  onPlay: () => void;
  onJoined: (token: string) => void;
  onRetry: () => void;
};

/**
 * Lo que ve cada jugador según el torneo. No hay práctica: solo se juega un
 * torneo ACTIVO, con sesión, con nombre y WhatsApp cargados y con intentos
 * disponibles (el servidor lo vuelve a comprobar al reservar cada intento).
 * Se puede invitar amigos solo mientras el torneo está programado o activo: un
 * torneo terminado no invita a jugar.
 */
export function PlayerPanel(props: PlayerPanelProps) {
  const { session, tournament, imageReady, imageFailed, starting, playError, instagramHandle } = props;
  const [recovering, setRecovering] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const status = tournament?.status ?? null;
  const finished = status === "FINISHED" || status === "RESULTS_PUBLISHED";
  const canJoin = status === "ACTIVE" || status === "SCHEDULED" || status === "PAUSED";
  const token = session.status === "ready" ? session.token : null;

  const instagram = (
    <a className={`${shared.ghost} ${styles.instagram}`} href={instagramUrl(instagramHandle)} target="_blank" rel="noopener noreferrer" onClick={props.onFollow}>
      Visitar {instagramHandle}
    </a>
  );

  // Compartir solo mientras se puede jugar (programado o activo).
  const share = (kind: "invite" | "record", prominent = false, title?: string) =>
    tournament && (status === "SCHEDULED" || status === "ACTIVE") ? (
      <SharePanel tournament={tournament} kind={kind} score={kind === "record" && session.status === "ready" ? (session.me.best?.score ?? null) : null} token={token} prominent={prominent} title={title} />
    ) : null;

  if (session.status === "loading") {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>Cargando tu participación…</p>
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
      </div>
    );
  }

  // Sin torneo: no se juega. Invitación a seguir el Instagram para enterarse del próximo.
  if (!tournament) {
    return (
      <div className={styles.panel}>
        {session.status === "ready" && (
          <>
            <p className={styles.hello}>
              Hola, <strong>{session.me.participant.handle}</strong>
            </p>
            {session.me.claims.map((claim) => (
              <PrizeClaim key={claim.editionId} token={session.token} claim={claim} onClaimed={props.onRetry} />
            ))}
          </>
        )}
        <p className={styles.attempts}>Seguinos y enterate primero del próximo desafío.</p>
        {instagram}
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
        {canJoin ? (
          recovering ? (
            <RecoverForm instagramHandle={instagramHandle} onJoined={props.onJoined} onBack={() => setRecovering(false)} />
          ) : props.followed ? (
            <JoinForm onJoined={props.onJoined} onRecover={() => setRecovering(true)} />
          ) : (
            <FollowStep instagramHandle={instagramHandle} onFollow={props.onFollow} />
          )
        ) : (
          instagram
        )}
        {status === "SCHEDULED" && share("invite", false, "🍪 Compartí el próximo desafío")}
        {status === "ACTIVE" && share("invite")}
      </div>
    );
  }

  const { me } = session;
  const attempts = me.attempts;
  const exhausted = status === "ACTIVE" && !!attempts && attempts.left === 0;
  const contact = me.participant.contact;

  const hello = (
    <p className={styles.hello}>
      Hola, <strong>{me.participant.handle}</strong>
    </p>
  );
  const claims = me.claims.map((claim) => <PrizeClaim key={claim.editionId} token={session.token} claim={claim} onClaimed={props.onRetry} />);

  // Torneo terminado: resumen personal (si jugó), sin invitaciones a jugar.
  if (finished) {
    return (
      <div className={styles.panel}>
        {hello}
        {claims}
        {me.tournament && me.best && (
          <dl className={styles.summary}>
            <div>
              <dt>Tu mejor puntuación</dt>
              <dd>{bitesText(me.best.score)}</dd>
            </div>
            <div>
              <dt>Tu posición</dt>
              <dd>#{me.best.position}</dd>
            </div>
            <div>
              <dt>Participantes</dt>
              <dd>{me.ranked}</dd>
            </div>
          </dl>
        )}
        {me.tournament && !me.best && attempts && attempts.used > 0 && <p className={styles.best}>No tuviste resultados válidos en este torneo.</p>}
        {instagram}
      </div>
    );
  }

  // Participante anterior sin nombre o WhatsApp: los deja antes de seguir jugando (conserva intentos y puntajes).
  // El histórico de prueba no se juega más: ahí no se piden.
  if (canJoin && !tournament.isTest && !contact.complete && !me.disqualified) {
    return (
      <div className={styles.panel}>
        {hello}
        {claims}
        <ContactForm token={session.token} mode="missing" onSaved={props.onRetry} />
      </div>
    );
  }

  if (editingContact) {
    return (
      <div className={styles.panel}>
        {hello}
        <ContactForm
          token={session.token}
          mode="update"
          onSaved={() => {
            setEditingContact(false);
            props.onRetry();
          }}
          onCancel={() => setEditingContact(false)}
        />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {hello}
      {claims}

      {exhausted && <p className={styles.exhausted}>¡YA USASTE TODOS TUS INTENTOS!</p>}

      {me.tournament &&
        status !== "SCHEDULED" &&
        (me.best ? (
          <p className={styles.best}>
            Tu mejor marca: <strong>{bitesText(me.best.score)}</strong> · Puesto <strong>#{me.best.position}</strong> de {me.ranked}
          </p>
        ) : (
          <p className={styles.best}>Todavía no tenés resultados en este torneo.</p>
        ))}

      {me.disqualified ? (
        <p className={styles.warning}>Tu participación en este torneo está suspendida. Si creés que es un error, escribinos.</p>
      ) : status === "SCHEDULED" && attempts ? (
        <p className={styles.attempts}>
          Vas a tener {attempts.limit} {attempts.limit === 1 ? "intento" : "intentos"} cuando empiece el torneo.
        </p>
      ) : status === "ACTIVE" && attempts && attempts.left > 0 ? (
        <>
          <p className={styles.attempts}>{attemptsText(attempts.left, attempts.limit)}</p>
          <button type="button" className={`${shared.cta} ${styles.play}`} onClick={props.onPlay} disabled={starting || !imageReady || imageFailed}>
            {starting ? "Preparando…" : imageReady ? "Jugar" : imageFailed ? "Sin foto" : "Horneando…"}
          </button>
          <p className={styles.small}>Cada partida usa un intento, aunque salgas antes de terminar. Cuenta tu mejor resultado.</p>
        </>
      ) : exhausted ? (
        <p className={styles.small}>
          Premio del torneo: <strong>{tournament.prize}</strong>
          {tournament.isTest ? " (histórico: sin premio)" : ""}
        </p>
      ) : null}

      {playError && (
        <p className={styles.warning} role="alert">
          {playError}
        </p>
      )}

      {status === "SCHEDULED" && share("invite", false, "🍪 Compartí el próximo desafío")}
      {status === "ACTIVE" && (exhausted ? share("record", true, "Desafiá a tus amigos") : share(me.best ? "record" : "invite"))}
      {(exhausted || status === "SCHEDULED") && instagram}

      {contact.complete && (
        <p className={styles.small}>
          Si ganás te avisamos por WhatsApp ({contact.phoneHint}).{" "}
          <button type="button" className={formStyles.textButton} onClick={() => setEditingContact(true)}>
            Actualizar mis datos
          </button>
        </p>
      )}
    </div>
  );
}
