"use client";

import { useEffect, useState } from "react";
import { SEQUENCE_VARIANTS, sequenceFor } from "@/lib/challenge/bite-sequence";
import { ChallengeGame, type GameResult } from "./ChallengeGame";
import { ChallengeIntro } from "./ChallengeIntro";
import { ChallengeResult } from "./ChallengeResult";
import { useCookieImage, type ChallengeCookie } from "./useCookieImage";
import styles from "./Challenge.module.css";

/** Mismo color que --ch-bg: evita el fondo crema de la tienda al estirar la página en el celular. */
const PAGE_BACKGROUND = "#1c110b";

type Screen = { name: "intro" } | { name: "game" } | ({ name: "result" } & GameResult);

type ChallengeAppProps = {
  cookie: ChallengeCookie | null;
  logoSrc: string | null;
};

/**
 * Sweet Click Challenge (etapa 1: demo local). Presentación → partida → resultado.
 * Una sola pantalla montada a la vez; la partida se re-monta en cada intento.
 */
export function ChallengeApp({ cookie, logoSrc }: ChallengeAppProps) {
  const { image, failed, retry } = useCookieImage(cookie);
  const [screen, setScreen] = useState<Screen>({ name: "intro" });
  const [round, setRound] = useState(0);

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

  const play = () => {
    window.scrollTo(0, 0);
    setRound((n) => n + 1);
    setScreen({ name: "game" });
  };

  const home = () => {
    window.scrollTo(0, 0);
    setScreen({ name: "intro" });
  };

  return (
    <div className={styles.root}>
      {screen.name === "game" && image && cookie ? (
        <ChallengeGame
          key={round}
          image={image}
          isCutout={cookie.isCutout}
          alt={cookie.alt}
          logoSrc={logoSrc}
          onFinish={(result) => setScreen({ name: "result", ...result })}
          onExit={home}
        />
      ) : screen.name === "result" ? (
        <ChallengeResult bites={screen.bites} cookies={screen.cookies} onReplay={play} onHome={home} />
      ) : (
        <ChallengeIntro cookie={cookie} logoSrc={logoSrc} ready={Boolean(image)} failed={failed} onPlay={play} onRetry={retry} />
      )}
    </div>
  );
}
