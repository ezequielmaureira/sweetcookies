"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { Brand } from "@/components/brand/Brand";
import type { ChallengeInfo } from "@/lib/challenge/challenge-api";
import { bitesText, challengePhase, formatCordobaDateTime, formatCountdown } from "@/lib/challenge/challenge-format";
import { Leaderboard } from "./Leaderboard";
import { PlayerPanel, type Session } from "./PlayerPanel";
import type { ChallengeCookie } from "./useCookieImage";
import { useServerNow } from "./useServerNow";
import styles from "./ChallengeIntro.module.css";

/** Migas decorativas alrededor de la cookie (posiciones fijas, en % del contenedor). */
const DECOR = [
  { x: 4, y: 30, size: 12, rotate: 18, tone: 0 },
  { x: 12, y: 74, size: 8, rotate: -24, tone: 2 },
  { x: 2, y: 56, size: 6, rotate: 40, tone: 1 },
  { x: 88, y: 18, size: 9, rotate: 12, tone: 1 },
  { x: 95, y: 48, size: 13, rotate: -30, tone: 0 },
  { x: 84, y: 82, size: 7, rotate: 64, tone: 2 },
  { x: 30, y: 96, size: 6, rotate: 10, tone: 1 },
  { x: 66, y: 98, size: 9, rotate: -50, tone: 0 },
] as const;

type ChallengeIntroProps = {
  cookie: ChallengeCookie | null;
  logoSrc: string | null;
  imageReady: boolean;
  imageFailed: boolean;
  info: ChallengeInfo | null;
  infoFailed: boolean;
  offsetMs: number;
  session: Session;
  followed: boolean;
  instagramHandle: string;
  starting: boolean;
  playError: string | null;
  focusRanking: boolean;
  onFollow: () => void;
  onPlay: () => void;
  onPractice: () => void;
  onJoined: (token: string) => void;
  onRefresh: () => void;
};

/**
 * Portada del campeonato: estado de la edición (lunes a viernes se compite,
 * sábado revisión, domingo cerrado), jugador, práctica, ranking y reglas.
 */
export function ChallengeIntro(props: ChallengeIntroProps) {
  const { cookie, logoSrc, info, session, instagramHandle, onRefresh } = props;
  const now = useServerNow(props.offsetMs);
  const edition = info?.edition ?? null;
  const status = edition?.status ?? null;
  const phase = edition ? challengePhase(edition, now) : null;

  // Hasta cuándo corre la cuenta regresiva según el momento de la semana.
  const target =
    !edition || phase === "paused"
      ? null
      : phase === "competition"
        ? Date.parse(edition.endsAt)
        : phase === "upcoming"
          ? Date.parse(edition.startsAt)
          : Date.parse(edition.nextStartsAt);
  const left = target !== null && now !== null ? target - now : null;
  const reached = left !== null && left <= 0;

  // Al llegar a cero (cierre del viernes, inicio del lunes) se vuelve a consultar al servidor.
  useEffect(() => {
    if (!reached) return;
    const timer = window.setTimeout(onRefresh, 1500);
    return () => window.clearTimeout(timer);
  }, [reached, onRefresh]);

  useEffect(() => {
    if (props.focusRanking) document.getElementById("ranking")?.scrollIntoView({ block: "start" });
  }, [props.focusRanking]);

  const myHandle = session.status === "ready" ? session.me.participant.handle : null;

  return (
    <main id="contenido" className={styles.intro}>
      <header className={styles.top}>
        <Link href="/" className={styles.homeLink} aria-label="Ir a Sweet Cookies">
          <Brand logoSrc={logoSrc} size="sm" decorative />
        </Link>
        <span className={styles.demoTag}>{edition?.isTest ? "Prueba privada" : "Río Cuarto"}</span>
      </header>
      {edition?.isTest && (
        <p className={styles.testBanner} role="note">
          Campeonato en prueba: los resultados no son oficiales y no hay premios reales.
        </p>
      )}

      <section className={styles.hero} aria-labelledby="challenge-title">
        <h1 id="challenge-title" className={`${styles.title} ${styles.enter}`} style={{ "--d": "100ms" } as React.CSSProperties}>
          <span>Sweet Click</span>
          <span className={styles.titleAccent}>Challenge</span>
        </h1>
        <p className={`${styles.lead} ${styles.enter}`} style={{ "--d": "200ms" } as React.CSSProperties}>
          ¡Competí por una caja de 3 cookies!
        </p>

        <div className={styles.cookieWrap}>
          <span className={styles.glow} aria-hidden="true" />
          {DECOR.map((crumb, i) => (
            <span
              key={i}
              className={`${styles.decor} ${styles[`tone${crumb.tone}`]}`}
              style={
                {
                  left: `${crumb.x}%`,
                  top: `${crumb.y}%`,
                  width: crumb.size,
                  height: crumb.size,
                  "--r": `${crumb.rotate}deg`,
                  "--d": `${300 + i * 70}ms`,
                } as React.CSSProperties
              }
              aria-hidden="true"
            />
          ))}
          <div className={styles.cookie}>
            {cookie ? (
              <Image
                src={cookie.path}
                alt={cookie.alt}
                fill
                sizes={cookie.sizes}
                preload
                draggable={false}
                className={cookie.isCutout ? styles.cutout : styles.round}
              />
            ) : (
              <span className={styles.missing}>Foto de la cookie</span>
            )}
          </div>
        </div>

        <div className={`${styles.status} ${styles.enter}`} style={{ "--d": "320ms" } as React.CSSProperties} aria-live="polite">
          {!edition ? (
            <p className={styles.statusText}>{props.infoFailed ? "No pudimos cargar el campeonato. Revisá tu conexión." : "Cargando campeonato…"}</p>
          ) : (
            <>
              <p className={styles.statusLabel}>
                {edition.isTest ? "Prueba" : "Edición"} #{edition.number} · {phase ? PHASE_LABELS[phase] : ""}
              </p>
              {phase === "competition" && (
                <p className={styles.statusText}>
                  Termina en <strong>{left === null ? "…" : formatCountdown(left)}</strong>
                  <span className={styles.statusSub}>Cierra el {formatCordobaDateTime(edition.endsAt)} (hora de Córdoba)</span>
                </p>
              )}
              {phase === "upcoming" && (
                <p className={styles.statusText}>
                  Empieza en <strong>{left === null ? "…" : formatCountdown(left)}</strong>
                </p>
              )}
              {phase === "paused" && <p className={styles.statusText}>Pausamos el campeonato un momento. Volvé a entrar en un rato.</p>}
              {status === "FINISHED" && (
                <p className={styles.statusText}>
                  {phase === "review"
                    ? "La competencia terminó. Hoy revisamos los resultados y publicamos al ganador."
                    : "Campeonato cerrado. Estamos terminando de verificar los resultados."}
                </p>
              )}
              {status === "RESULTS_PUBLISHED" && (
                <p className={styles.statusText}>
                  {info?.winner ? (
                    <>
                      Ganador confirmado: <strong>{info.winner.handle}</strong> con {bitesText(info.winner.score)}
                    </>
                  ) : (
                    "Resultados publicados: esta semana no hubo ganador."
                  )}
                </p>
              )}
              {(phase === "review" || phase === "closed") && (
                <p className={styles.statusSub}>
                  {phase === "closed" ? "Hoy está cerrado. " : ""}Nueva edición el lunes, en {left === null ? "…" : formatCountdown(left)}. Mientras tanto, podés practicar.
                </p>
              )}
            </>
          )}
        </div>

        <div className={`${styles.player} ${styles.enter}`} style={{ "--d": "400ms" } as React.CSSProperties}>
          <PlayerPanel
            session={session}
            editionStatus={status}
            serverNow={now}
            followed={props.followed}
            imageReady={props.imageReady}
            imageFailed={props.imageFailed}
            starting={props.starting}
            playError={props.playError}
            instagramHandle={instagramHandle}
            onFollow={props.onFollow}
            onPlay={props.onPlay}
            onPractice={props.onPractice}
            onJoined={props.onJoined}
            onRetry={onRefresh}
          />
        </div>

        <Leaderboard rows={info ? info.leaderboard : null} myHandle={myHandle} prize={edition?.prize ?? "Caja de 3 cookies"} />

        <ul className={styles.rules}>
          <li>
            <strong>15 seg</strong>
            por partida
          </li>
          <li>
            <strong>3 intentos</strong>
            por semana
          </li>
          <li>
            <strong>Lun a vie</strong>
            el sábado, el ganador
          </li>
        </ul>
        <p className={styles.basesLink}>
          <Link href="/campeonato/bases">Bases y condiciones</Link> · Solo para residentes de Río Cuarto
        </p>
      </section>
    </main>
  );
}

const PHASE_LABELS = {
  upcoming: "Por empezar",
  competition: "En juego",
  paused: "En pausa",
  review: "Revisión de resultados",
  closed: "Cerrado",
} as const;
