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
  saveFollowed,
  savePending,
  saveToken,
  startGame,
  type ChallengeInfo,
  type PendingResult,
} from "@/lib/challenge/challenge-api";
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
  | { name: "game"; round: number; official: { gameId: string; attemptNumber: number; limit: number } | null }
  | { name: "result"; pending: PendingResult; state: ResultState }
  | { name: "practiceResult"; round: number; bites: number; cookies: number };

type ChallengeAppProps = {
  cookie: ChallengeCookie | null;
  logoSrc: string | null;
};

/**
 * Sweet Click Challenge: portada (estado, acceso, intentos, ranking) →
 * partida oficial (el servidor reserva el intento) o práctica libre (sin
 * servidor) → resultado (el oficial lo valida el servidor).
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
  const roundRef = useRef(0);

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
      const data = await getChallenge();
      setOffsetMs(Date.parse(data.edition.serverNow) - Date.now());
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
      setSession({ status: "ready", token, me: await getMe(token) });
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

  /** Cierre de una partida oficial (también el que quedó pendiente de otra visita). */
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

  // Primera carga: campeonato, sesión de este navegador y un resultado pendiente si lo hay.
  useEffect(() => {
    // Fuera del render: localStorage solo existe en el navegador.
    const timer = window.setTimeout(() => {
      tokenRef.current = loadToken();
      setFollowed(loadFollowed());
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
    saveFollowed();
    setFollowed(true);
    setSession({ status: "loading" });
    refresh();
  };

  const play = async () => {
    const token = tokenRef.current;
    if (!token || !image || starting) return;
    setStarting(true);
    setPlayError(null);
    try {
      // El servidor reserva el intento ANTES de jugar: recargar o abrir otra pestaña no da intentos extra.
      const { game, attempts } = await startGame(token);
      window.scrollTo(0, 0);
      roundRef.current += 1;
      setScreen({ name: "game", round: roundRef.current, official: { gameId: game.id, attemptNumber: game.attemptNumber, limit: attempts.limit } });
    } catch (error) {
      const code = error instanceof ChallengeApiError ? error.code : "";
      setPlayError(
        code === "no_attempts"
          ? "Ya usaste tus 3 intentos oficiales de esta semana. Podés seguir practicando."
          : code === "edition_not_active"
            ? "El campeonato no está en juego en este momento. Podés practicar."
            : code === "disqualified"
              ? "Tu participación en esta edición está suspendida."
              : code === "too_many_requests"
                ? "Demasiados intentos seguidos. Esperá un momento."
                : "No pudimos empezar la partida. Revisá tu conexión y probá de nuevo.",
      );
      setScreen({ name: "intro", focusRanking: false });
      refresh();
    } finally {
      setStarting(false);
    }
  };

  /** Práctica ilimitada: no pide sesión, no usa intentos y nunca llega al servidor. */
  const practice = () => {
    if (!image) return;
    window.scrollTo(0, 0);
    roundRef.current += 1;
    setScreen({ name: "game", round: roundRef.current, official: null });
  };

  const finished = (round: number, official: { gameId: string } | null, result: GameResult) => {
    if (!official) {
      setScreen({ name: "practiceResult", round, bites: result.bites, cookies: result.cookies });
      return;
    }
    const pending: PendingResult = { gameId: official.gameId, taps: result.taps, untrusted: result.untrusted, bites: result.bites, cookies: result.cookies };
    // Se guarda antes de enviar: si se corta la conexión, se reintenta en la próxima visita.
    savePending(pending);
    setScreen({ name: "result", pending, state: { status: "sending" } });
    void submit(pending, true);
  };

  const exitGame = (official: boolean) => {
    if (official && !window.confirm("Si salís ahora, este intento oficial se pierde. ¿Salir igual?")) return;
    setScreen({ name: "intro", focusRanking: false });
    if (official) refresh();
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
          practice={screen.official === null}
          modeLabel={screen.official ? `Oficial · intento ${screen.official.attemptNumber} de ${screen.official.limit}` : "Práctica"}
          onFinish={(result) => finished(screen.round, screen.official, result)}
          onExit={() => exitGame(screen.official !== null)}
        />
      ) : screen.name === "result" || screen.name === "practiceResult" ? (
        <ChallengeResult
          key={screen.name === "result" ? screen.pending.gameId : `practice-${screen.round}`}
          practice={screen.name === "practiceResult"}
          local={screen.name === "result" ? { bites: screen.pending.bites, cookies: screen.pending.cookies } : { bites: screen.bites, cookies: screen.cookies }}
          state={screen.name === "result" ? screen.state : { status: "sending" }}
          starting={starting}
          onReplay={play}
          onPractice={practice}
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
          onPractice={practice}
          onJoined={joined}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
