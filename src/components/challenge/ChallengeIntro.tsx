"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { Brand } from "@/components/brand/Brand";
import type { ChallengeInfo } from "@/lib/challenge/challenge-api";
import { bitesText, formatCordobaDateTime, formatCountdown } from "@/lib/challenge/challenge-format";
import { Leaderboard } from "./Leaderboard";
import { PlayerPanel, type Session } from "./PlayerPanel";
import { PrizePhoto } from "./PrizePhoto";
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
  onJoined: (token: string) => void;
  onRefresh: () => void;
};

/**
 * Portada del campeonato. Se adapta al torneo que configuró el admin: sin
 * torneo ("Próximamente"), programado, activo, pausado, finalizado, con
 * ganador publicado o cancelado. No hay práctica: solo se juega un torneo
 * activo. Un torneo terminado agradece y muestra el ranking final (sin invitar
 * a jugar). Las cuentas regresivas son informativas: el servidor valida
 * siempre las fechas.
 */
export function ChallengeIntro(props: ChallengeIntroProps) {
  const { cookie, logoSrc, info, session, instagramHandle, onRefresh } = props;
  const now = useServerNow(props.offsetMs);
  const tournament = info?.tournament ?? null;
  const next = info?.next ?? null;
  const status = tournament?.status ?? null;

  // Hasta cuándo corre la cuenta regresiva: cierre si está activo, inicio si está programado.
  const target = !tournament ? null : status === "ACTIVE" ? Date.parse(tournament.endsAt) : status === "SCHEDULED" ? Date.parse(tournament.startsAt) : null;
  const left = target !== null && now !== null ? target - now : null;
  const nextLeft = next && next.status === "SCHEDULED" && now !== null ? Date.parse(next.startsAt) - now : null;
  const reached = (left !== null && left <= 0) || (nextLeft !== null && nextLeft <= 0);

  // Al llegar a cero (inicio o cierre) se vuelve a consultar al servidor, que es quien decide.
  useEffect(() => {
    if (!reached) return;
    const timer = window.setTimeout(onRefresh, 1500);
    return () => window.clearTimeout(timer);
  }, [reached, onRefresh]);

  useEffect(() => {
    if (props.focusRanking) document.getElementById("ranking")?.scrollIntoView({ block: "start" });
  }, [props.focusRanking]);

  const myHandle = session.status === "ready" ? session.me.participant.handle : null;
  const showRanking = tournament !== null && status !== "SCHEDULED";

  return (
    <main id="contenido" className={styles.intro}>
      <header className={styles.top}>
        <Link href="/" className={styles.homeLink} aria-label="Ir a Sweet Cookies">
          <Brand logoSrc={logoSrc} size="sm" decorative />
        </Link>
        <span className={styles.demoTag}>{tournament?.isTest ? "Histórico" : "Río Cuarto"}</span>
      </header>
      {tournament?.isTest && (
        <p className={styles.testBanner} role="note">
          Torneo histórico de prueba: sus resultados no son oficiales y no tiene premio.
        </p>
      )}

      <section className={styles.hero} aria-labelledby="challenge-title">
        <h1 id="challenge-title" className={`${styles.title} ${styles.enter}`} style={{ "--d": "100ms" } as React.CSSProperties}>
          <span>Sweet Click</span>
          <span className={styles.titleAccent}>Challenge</span>
        </h1>
        <p className={`${styles.lead} ${styles.enter}`} style={{ "--d": "200ms" } as React.CSSProperties}>
          {!info
            ? "¡Comé la mayor cantidad de cookies en 15 segundos!"
            : !tournament
              ? "PRÓXIMAMENTE, NUEVO DESAFÍO"
              : status === "RESULTS_PUBLISHED" || status === "FINISHED" || status === "CANCELLED"
                ? tournament.name
                : `¡Competí por ${lowerFirst(tournament.prize)}!`}
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
          {!info ? (
            <p className={styles.statusText}>{props.infoFailed ? "No pudimos cargar el campeonato. Revisá tu conexión." : "Cargando campeonato…"}</p>
          ) : !tournament ? (
            <>
              <p className={styles.statusLabel}>Sin torneo en curso</p>
              <p className={styles.statusText}>Estamos preparando el próximo desafío.</p>
            </>
          ) : (
            <>
              <p className={styles.statusLabel}>
                {tournament.name} · {STATUS_LABELS[tournament.status]}
              </p>
              {status === "FINISHED" && (
                <div className={styles.ended}>
                  <p className={styles.endedTitle}>🏆 DESAFÍO TERMINADO</p>
                  <p className={styles.endedThanks}>¡Gracias por participar!</p>
                  <p className={styles.statusSub}>Estamos verificando los resultados para confirmar al ganador.</p>
                  <p className={styles.statusSub}>
                    {info.ranked} {info.ranked === 1 ? "participante" : "participantes"} con resultado
                  </p>
                </div>
              )}
              {status === "RESULTS_PUBLISHED" &&
                (info.winner ? (
                  <div className={styles.ended}>
                    <p className={styles.endedTitle}>🏆 TENEMOS GANADOR</p>
                    <p className={styles.winner}>{info.winner.handle}</p>
                    <p className={styles.statusSub}>Con {bitesText(info.winner.score)}</p>
                    <p className={styles.prize}>
                      Premio: <strong>{tournament.prize}</strong>
                      {tournament.isTest && <span className={styles.statusSub}> (histórico: sin premio)</span>}
                    </p>
                  </div>
                ) : (
                  <p className={styles.statusText}>Resultados publicados: este torneo no tuvo ganador.</p>
                ))}
              {status !== "RESULTS_PUBLISHED" && status !== "CANCELLED" && (
                <p className={styles.prize}>
                  🏆 Premio para el 1.º puesto: <strong>{tournament.prize}</strong>
                  {tournament.isTest && <span className={styles.statusSub}> (histórico: sin premio)</span>}
                </p>
              )}
              {status !== "CANCELLED" && (status !== "RESULTS_PUBLISHED" || info.winner) && (
                <PrizePhoto src={tournament.prizeImageUrl} prize={tournament.prize} size={status === "FINISHED" ? "sm" : "md"} />
              )}
              {tournament.prizeDescription && status !== "RESULTS_PUBLISHED" && status !== "FINISHED" && <p className={styles.statusSub}>{tournament.prizeDescription}</p>}
              {tournament.description && (status === "SCHEDULED" || status === "ACTIVE") && <p className={styles.description}>{tournament.description}</p>}
              {status === "ACTIVE" && (
                <p className={styles.statusText}>
                  Termina en <strong>{left === null ? "…" : formatCountdown(left)}</strong>
                  <span className={styles.statusSub}>Cierra el {formatCordobaDateTime(tournament.endsAt)} (hora de Córdoba)</span>
                </p>
              )}
              {status === "SCHEDULED" && (
                <p className={styles.statusText}>
                  Empieza en <strong>{left === null ? "…" : formatCountdown(left)}</strong>
                  <span className={styles.statusSub}>
                    El {formatCordobaDateTime(tournament.startsAt)} (hora de Córdoba) · {tournament.attempts} {tournament.attempts === 1 ? "intento" : "intentos"} por participante
                  </span>
                </p>
              )}
              {status === "PAUSED" && <p className={styles.statusText}>Pausamos el torneo un momento. Volvé a entrar en un rato.</p>}
              {status === "CANCELLED" && <p className={styles.statusText}>Este torneo fue cancelado.</p>}
            </>
          )}
          {info?.linkStatus === "invalid" && <p className={styles.statusSub}>El enlace que abriste no corresponde a un desafío disponible. Te mostramos el desafío actual.</p>}
          {info?.linkStatus === "removed" && (
            <p className={styles.linkNotice} role="note">
              Este torneo ya no está disponible.{tournament ? " Te mostramos el desafío actual." : ""}
            </p>
          )}
          {next &&
            (next.status === "SCHEDULED" ? (
              <p className={styles.nextTeaser}>
                Próximo desafío: <strong>{next.name}</strong> · {next.prize}
                <span className={styles.statusSub}>
                  Empieza el {formatCordobaDateTime(next.startsAt)} · en {nextLeft === null ? "…" : formatCountdown(nextLeft)}
                </span>
              </p>
            ) : (
              <a className={styles.nextTeaser} href="/campeonato">
                Desafío en curso: <strong>{next.name}</strong> · {next.prize}
                <span className={styles.statusSub}>Tocá para ir a jugar</span>
              </a>
            ))}
        </div>

        <div className={`${styles.player} ${styles.enter}`} style={{ "--d": "400ms" } as React.CSSProperties}>
          <PlayerPanel
            session={session}
            tournament={tournament}
            followed={props.followed}
            imageReady={props.imageReady}
            imageFailed={props.imageFailed}
            starting={props.starting}
            playError={props.playError}
            instagramHandle={instagramHandle}
            onFollow={props.onFollow}
            onPlay={props.onPlay}
            onJoined={props.onJoined}
            onRetry={onRefresh}
          />
        </div>

        {showRanking && tournament && (
          <Leaderboard
            rows={info ? info.leaderboard : null}
            myHandle={myHandle}
            prize={tournament.prize}
            final={status === "FINISHED" || status === "RESULTS_PUBLISHED" || status === "CANCELLED"}
            pendingReview={status === "FINISHED"}
          />
        )}

        <ul className={styles.rules}>
          <li>
            <strong>15 seg</strong>
            por partida
          </li>
          <li>
            <strong>{tournament ? `${tournament.attempts} ${tournament.attempts === 1 ? "intento" : "intentos"}` : "Intentos"}</strong>
            {tournament ? "en este torneo" : "según cada torneo"}
          </li>
          <li>
            <strong>Gana</strong>
            la mejor partida
          </li>
        </ul>
        <p className={styles.basesLink}>
          <Link href="/campeonato/bases">Bases y condiciones</Link> · Solo para residentes de Río Cuarto
        </p>
      </section>
    </main>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const STATUS_LABELS = {
  DRAFT: "Borrador",
  UNPUBLISHED: "No disponible",
  SCHEDULED: "Programado",
  ACTIVE: "En juego",
  PAUSED: "En pausa",
  FINISHED: "Finalizado",
  RESULTS_PUBLISHED: "Ganador publicado",
  CANCELLED: "Cancelado",
} as const;
