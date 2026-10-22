"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { site } from "@/data/site";
import { SEQUENCE_VARIANTS, sequenceFor } from "@/lib/challenge/bite-sequence";
import {
  ChallengeApiError,
  finishWithRetry,
  getChallenge,
  getMe,
  loadFollowed,
  loadPending,
  loadToken,
  randomId,
  recordVisit,
  saveFollowed,
  savePending,
  saveRef,
  saveToken,
  startGame,
  visitorId,
  type ChallengeInfo,
  type PendingResult,
} from "@/lib/challenge/challenge-api";
import { readLinkParams } from "@/lib/challenge/challenge-format";
import { ChallengeGame, type GameResult } from "./ChallengeGame";
import { ChallengeIntro } from "./ChallengeIntro";
import { ChallengeResult, type ResultState } from "./ChallengeResult";
import type { Session } from "./PlayerPanel";
import { useCookieImage, type ChallengeCookie } from "./useCookieImage";
import styles from "./Challenge.module.css";

/** Mismo color que --ch-bg: evita el fondo crema de la tienda al estirar la página en el celular. */
const PAGE_BACKGROUND = "#1c110b";
/** Refresco del ranking y del estado mientras se mira la portada. */
const POLL_MS = 30_000;

type Screen =
  | { name: "intro"; focusRanking: boolean }
  | { name: "game"; round: number; gameId: string; attemptNumber: number; limit: number }
  | { name: "result"; pending: PendingResult; state: ResultState };

type ChallengeAppProps = {
  cookie: ChallengeCookie | null;
  logoSrc: string | null;
};

/**
 * Sweet Click Challenge: portada (torneo, acceso, intentos, ranking,
 * invitaciones) → partida oficial (el servidor reserva el intento) → resultado
 * validado por el servidor. No hay práctica: la única forma de jugar es
 * reservando un intento del torneo activo.
 *
 * Enlaces /campeonato?torneo=ID&ref=CODIGO: muestran ese torneo y miden la
 * visita; el código se guarda para atribuir el registro. No saltean el paso
 * de Instagram ni el registro, y no dan intentos extra.
 */
export function ChallengeApp({ cookie, logoSrc }: ChallengeAppProps) {
  const { image, failed: imageFailed } = useCookieImage(cookie);
  const [screen, setScreen] = useState<Screen>({ name: "intro", focusRanking: false });
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [infoFailed, setInfoFailed] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [followed, setFollowed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tournamentRef = useRef<string | null>(null);
  const roundRef = useRef(0);
  // Freno sincrónico contra el doble toque (el estado de React tarda un render).
  const startingRef = useRef(false);

  useEffect(() => {
    const body = document.body;
    const previous = body.style.backgroundColor;
    body.style.backgroundColor = PAGE_BACKGROUND;
    return () => {
      body.style.backgroundColor = previous;
    };
  }, []);

  // Las secuencias de mordidas se calculan de a una mientras se mira la portada.
  useEffect(() => {
    let next = 0;
    let timer = 0;
    const warm = () => {
      sequenceFor(next++);
      if (next < SEQUENCE_VARIANTS) timer = window.setTimeout(warm, 40);
    };
    timer = window.setTimeout(warm, 400);
    return () => window.clearTimeout(timer);
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      const data = await getChallenge(tournamentRef.current);
      setOffsetMs(Date.parse(data.serverNow) - Date.now());
      setInfo(data);
      setInfoFailed(false);
    } catch {
      setInfoFailed(true);
    }
  }, []);

  const loadSession = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setSession((s) => (s.status === "none" ? s : { status: "none", lost: false }));
      return;
    }
    try {
      setSession({ status: "ready", token, me: await getMe(token, tournamentRef.current) });
    } catch (error) {
      if (error instanceof ChallengeApiError && error.status === 401) {
        // El token ya no vale en el servidor (por ejemplo, se recuperó en otro navegador).
        tokenRef.current = null;
        saveToken(null);
        setSession({ status: "none", lost: true });
      } else {
        setSession({ status: "error" });
      }
    }
  }, []);

  const refresh = useCallback(() => {
    void loadInfo();
    void loadSession();
  }, [loadInfo, loadSession]);

  /** Cierre de una partida (también el que quedó pendiente de otra visita). */
  const submit = useCallback(
    async (pending: PendingResult, showResult: boolean) => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        const response = await finishWithRetry(token, pending);
        savePending(null);
        if (showResult) setScreen((s) => (s.name === "result" && s.pending.gameId === pending.gameId ? { ...s, state: { status: "done", response } } : s));
      } catch (error) {
        const definitive = error instanceof ChallengeApiError && error.status >= 400 && error.status < 500 && error.status !== 429;
        if (definitive) savePending(null);
        if (showResult) setScreen((s) => (s.name === "result" && s.pending.gameId === pending.gameId ? { ...s, state: { status: "failed", definitive } } : s));
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  // Primera carga: enlace (torneo y código de invitación), campeonato, sesión y un resultado pendiente.
  useEffect(() => {
    // Fuera del render: localStorage y la URL solo existen en el navegador.
    const timer = window.setTimeout(() => {
      const link = readLinkParams(window.location.search);
      tournamentRef.current = link.tournamentId;
      tokenRef.current = loadToken();
      setFollowed(loadFollowed());
      if (link.ref) {
        // Se recuerda para atribuir el registro y se cuenta la visita (una por navegador).
        if (!tokenRef.current) saveRef(link.ref);
        void recordVisit(link.ref, visitorId(), tokenRef.current);
      }
      const pending = loadPending();
      void loadInfo();
      if (pending && tokenRef.current) void submit(pending, false);
      else void loadSession();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInfo, loadSession, submit]);

  // Ranking y estado al día mientras se mira la portada (solo con la pestaña visible).
  useEffect(() => {
    if (screen.name !== "intro") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [screen.name, refresh]);

  const follow = () => {
    // No se comprueba si siguió la cuenta: el paso solo queda recordado en este navegador.
    saveFollowed();
    setFollowed(true);
  };

  const joined = (token: string) => {
    tokenRef.current = token;
    saveToken(token);
    saveRef(null);
    saveFollowed();
    setFollowed(true);
    setSession({ status: "loading" });
    refresh();
  };

  /**
   * Partida oficial: el servidor reserva el intento ANTES de jugar. Cada toque
   * de "Jugar" lleva un id propio: si el pedido se repite (doble toque, red
   * lenta), el servidor devuelve la misma partida y no gasta otro intento.
   * Recargar la página o abrir otra pestaña tampoco devuelve intentos.
   */
  const play = async () => {
    const token = tokenRef.current;
    if (!token || !image || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setPlayError(null);
    const requestId = randomId();
    try {
      let reserved: Awaited<ReturnType<typeof startGame>> | null = null;
      for (let attempt = 0; attempt < 3 && !reserved; attempt++) {
        try {
          reserved = await startGame(token, requestId);
        } catch (error) {
          // Solo se reintenta (con el MISMO id) si no hubo respuesta del servidor.
          if (!(error instanceof ChallengeApiError && error.status === 0) || attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
      if (!reserved) throw new ChallengeApiError(0);
      window.scrollTo(0, 0);
      roundRef.current += 1;
      setScreen({ name: "game", round: roundRef.current, gameId: reserved.game.id, attemptNumber: reserved.game.attemptNumber, limit: reserved.attempts.limit });
    } catch (error) {
      const code = error instanceof ChallengeApiError ? error.code : "";
      setPlayError(
        code === "no_attempts"
          ? "¡Ya usaste todos tus intentos de este torneo! Desafiá a tus amigos para que lo intenten."
          : code === "edition_not_active"
            ? "No hay un torneo en juego en este momento."
            : code === "disqualified"
              ? "Tu participación en este torneo está suspendida."
              : code === "too_many_requests"
                ? "Demasiados intentos seguidos. Esperá un momento."
                : "No pudimos empezar la partida. Revisá tu conexión y probá de nuevo.",
      );
      setScreen({ name: "intro", focusRanking: false });
      refresh();
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  const finished = (gameId: string, result: GameResult) => {
    const pending: PendingResult = { gameId, taps: result.taps, untrusted: result.untrusted, bites: result.bites, cookies: result.cookies };
    // Se guarda antes de enviar: si se corta la conexión, se reintenta en la próxima visita.
    savePending(pending);
    setScreen({ name: "result", pending, state: { status: "sending" } });
    void submit(pending, true);
  };

  const exitGame = () => {
    if (!window.confirm("Si salís ahora, este intento se pierde. ¿Salir igual?")) return;
    setScreen({ name: "intro", focusRanking: false });
    refresh();
  };

  const retrySubmit = () => {
    if (screen.name !== "result") return;
    setScreen({ ...screen, state: { status: "sending" } });
    void submit(screen.pending, true);
  };

  const home = () => {
    window.scrollTo(0, 0);
    setScreen({ name: "intro", focusRanking: false });
  };

  const instagramHandle = info?.instagramHandle ?? site.instagram.handle;

  return (
    <div className={styles.root}>
      {screen.name === "game" && image && cookie ? (
        <ChallengeGame
          key={screen.round}
          image={image}
          isCutout={cookie.isCutout}
          alt={cookie.alt}
          logoSrc={logoSrc}
          modeLabel={`Intento ${screen.attemptNumber} de ${screen.limit}`}
          onFinish={(result) => finished(screen.gameId, result)}
          onExit={exitGame}
        />
      ) : screen.name === "result" ? (
        <ChallengeResult
          key={screen.pending.gameId}
          local={{ bites: screen.pending.bites, cookies: screen.pending.cookies }}
          state={screen.state}
          token={session.status === "ready" ? session.token : null}
          starting={starting}
          onReplay={play}
          onRetry={retrySubmit}
          onRanking={() => setScreen({ name: "intro", focusRanking: true })}
          onHome={home}
        />
      ) : (
        <ChallengeIntro
          cookie={cookie}
          logoSrc={logoSrc}
          imageReady={Boolean(image)}
          imageFailed={imageFailed}
          info={info}
          infoFailed={infoFailed}
          offsetMs={offsetMs}
          session={session}
          followed={followed}
          instagramHandle={instagramHandle}
          starting={starting}
          playError={playError}
          focusRanking={screen.name === "intro" && screen.focusRanking}
          onFollow={follow}
          onPlay={play}
          onJoined={joined}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
