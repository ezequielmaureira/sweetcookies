"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand/Brand";
import { sequenceFor, type CookieSequence } from "@/lib/challenge/bite-sequence";
import { CookieRenderer } from "@/lib/challenge/cookie-renderer";
import { CrumbField } from "@/lib/challenge/crumbs";
import { GAME_DURATION_MS, URGENT_MS, createTapCounter, formatTimer, type TapCounter } from "@/lib/challenge/scoring";
import styles from "./ChallengeGame.module.css";

export type GameResult = { bites: number; cookies: number };

type Stage = "countdown" | "playing" | "over";

const COUNTDOWN = ["3", "2", "1", "¡YA!"] as const;
const GO_STEP = COUNTDOWN.length - 1;
const COUNTDOWN_STEP_MS = 650;
/** Pausa con "¡TIEMPO!" antes de pasar al resultado. */
const RESULT_DELAY_MS = 1100;
/** Toque válido: dentro del círculo de la cookie, con margen para el dedo (fracción del lado). */
const HIT_RADIUS = 0.54;

const SQUASH: Keyframe[] = [{ transform: "scale(1)" }, { transform: "scale(0.965)" }, { transform: "scale(1)" }];
const POP_IN: Keyframe[] = [
  { transform: "scale(0.8)", opacity: 0 },
  { transform: "scale(1.04)", opacity: 1, offset: 0.7 },
  { transform: "scale(1)", opacity: 1 },
];
const COUNTER_POP: Keyframe[] = [{ transform: "scale(1.18)" }, { transform: "scale(1)" }];

/** Estado de la partida: vive fuera de React (un toque no re-renderiza nada). */
type Engine = {
  renderer: CookieRenderer;
  crumbs: CrumbField;
  counter: TapCounter;
  sequence: CookieSequence;
  startAt: number;
  playing: boolean;
  urgent: boolean;
  reduced: boolean;
  bites: number;
  cookies: number;
  cookieIndex: number;
  inCookie: number;
  squash: Animation | null;
  pop: Animation | null;
};

type ChallengeGameProps = {
  image: HTMLImageElement;
  isCutout: boolean;
  alt: string;
  logoSrc: string | null;
  onFinish: (result: GameResult) => void;
  onExit: () => void;
};

/**
 * Partida de 15 s: cuenta regresiva → toques → "¡TIEMPO!" → onFinish.
 * El cronómetro se calcula siempre contra performance.now() (no suma intervalos).
 */
export function ChallengeGame({ image, isCutout, alt, logoSrc, onFinish, onExit }: ChallengeGameProps) {
  const [stage, setStage] = useState<Stage>("countdown");
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const cookieRef = useRef<HTMLCanvasElement>(null);
  const rimRef = useRef<HTMLCanvasElement>(null);
  const crumbsRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const bitesRef = useRef<HTMLSpanElement>(null);
  const cookiesRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const root = rootRef.current;
    const stageEl = stageRef.current;
    const cookieCanvas = cookieRef.current;
    const rimCanvas = rimRef.current;
    const crumbsCanvas = crumbsRef.current;
    if (!root || !stageEl || !cookieCanvas || !rimCanvas || !crumbsCanvas) return;

    const sequence = sequenceFor(0);
    const engine: Engine = {
      renderer: new CookieRenderer(cookieCanvas, rimCanvas, image, isCutout),
      crumbs: new CrumbField(crumbsCanvas),
      counter: createTapCounter(),
      sequence,
      startAt: 0,
      playing: false,
      urgent: false,
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      bites: 0,
      cookies: 0,
      cookieIndex: 0,
      inCookie: 0,
      squash: null,
      pop: null,
    };
    engineRef.current = engine;
    engine.renderer.reset(sequence);

    const fit = () => {
      const size = stageEl.clientWidth;
      if (!size) return;
      const dpr = window.devicePixelRatio || 1;
      engine.renderer.resize(size, dpr);
      engine.crumbs.resize(size, dpr);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stageEl);

    const paintTimer = (left: number) => {
      const text = formatTimer(left);
      if (timerRef.current && timerRef.current.textContent !== text) timerRef.current.textContent = text;
      const spent = Math.min(1, Math.max(0, 1 - left / GAME_DURATION_MS));
      ringRef.current?.style.setProperty("stroke-dashoffset", (spent * 100).toFixed(2));
    };

    const timers: number[] = [];
    const finish = () => {
      engine.playing = false;
      paintTimer(0);
      setStage("over");
      if (!engine.reduced) navigator.vibrate?.([30, 60, 30]);
      timers.push(
        window.setTimeout(() => onFinishRef.current({ bites: engine.bites, cookies: engine.cookies }), RESULT_DELAY_MS),
      );
    };

    // Un único bucle: cronómetro + migas. Si la pestaña se oculta, al volver
    // el tiempo ya corrió (es tiempo real) y la partida se cierra si corresponde.
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (engine.playing) {
        const left = GAME_DURATION_MS - (performance.now() - engine.startAt);
        paintTimer(left);
        if (!engine.urgent && left <= URGENT_MS) {
          engine.urgent = true;
          root.dataset.urgent = "true";
        }
        if (left <= 0) finish();
      }
      engine.crumbs.step(now);
    };
    raf = requestAnimationFrame(frame);

    // Cuenta regresiva: 3, 2, 1 y "¡YA!" (con el "¡YA!" ya se puede morder).
    for (let i = 1; i <= GO_STEP; i++) {
      timers.push(
        window.setTimeout(() => {
          setStep(i);
          if (i !== GO_STEP) return;
          engine.startAt = performance.now();
          engine.playing = true;
          setStage("playing");
          stageEl.focus({ preventScroll: true });
        }, i * COUNTDOWN_STEP_MS),
      );
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      engineRef.current = null;
    };
  }, [image, isCutout]);

  const bite = (clientX?: number, clientY?: number) => {
    const engine = engineRef.current;
    const stageEl = stageRef.current;
    if (!engine || !engine.playing || !stageEl) return;
    const at = performance.now() - engine.startAt;

    if (clientX !== undefined && clientY !== undefined) {
      const rect = stageEl.getBoundingClientRect();
      const dx = (clientX - rect.left) / rect.width - 0.5;
      const dy = (clientY - rect.top) / rect.height - 0.5;
      if (Math.hypot(dx, dy) > HIT_RADIUS) return;
    }
    if (!engine.counter.tap(at)) return;

    const current = engine.sequence[engine.inCookie];
    engine.renderer.bite(current);
    engine.bites++;
    engine.inCookie++;
    if (bitesRef.current) bitesRef.current.textContent = String(engine.bites);

    const body = bodyRef.current;
    if (current.final) {
      engine.cookies++;
      engine.cookieIndex++;
      engine.inCookie = 0;
      engine.sequence = sequenceFor(engine.cookieIndex);
      engine.renderer.reset(engine.sequence);
      if (cookiesRef.current) cookiesRef.current.textContent = String(engine.cookies);
    }
    body?.style.setProperty("--remaining", String(current.final ? 1 : current.remaining));

    if (engine.reduced) return;
    engine.crumbs.spawn(current.crumbs, current.final ? "burst" : "bite");
    engine.squash?.cancel();
    engine.squash =
      body?.animate(current.final ? POP_IN : SQUASH, {
        duration: current.final ? 200 : 110,
        easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
      }) ?? null;
    engine.pop?.cancel();
    engine.pop = bitesRef.current?.animate(COUNTER_POP, { duration: 140, easing: "ease-out" }) ?? null;
    navigator.vibrate?.(current.final ? [12, 40, 18] : 6);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    bite(event.clientX, event.clientY);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!event.repeat) bite();
  };

  const showCount = stage === "countdown" || (stage === "playing" && step === GO_STEP);

  return (
    <div ref={rootRef} className={styles.game} data-stage={stage} onContextMenu={(event) => event.preventDefault()}>
      <span className={styles.vignette} aria-hidden="true" />

      <header className={styles.top}>
        <Brand logoSrc={logoSrc} size="sm" decorative />
        <button type="button" className={styles.exit} onClick={onExit}>
          Salir
        </button>
      </header>

      <div className={styles.hud}>
        <div className={styles.timer} role="timer" aria-label="Tiempo restante">
          <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
            <circle className={styles.ringTrack} cx="50" cy="50" r="44" pathLength={100} />
            <circle ref={ringRef} className={styles.ringBar} cx="50" cy="50" r="44" pathLength={100} />
          </svg>
          <span className={styles.timerText}>
            <span ref={timerRef} className={styles.timerValue}>
              {formatTimer(GAME_DURATION_MS)}
            </span>
            <span className={styles.timerUnit}>seg</span>
          </span>
        </div>
        <div className={styles.stat}>
          <span ref={bitesRef} className={styles.statValue}>
            0
          </span>
          <span className={styles.statLabel}>mordidas</span>
        </div>
      </div>

      <div className={styles.arena}>
        <button
          ref={stageRef}
          type="button"
          className={styles.stage}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          aria-label={`${alt}. Tocá para morder.`}
        >
          <span ref={bodyRef} className={styles.body} aria-hidden="true">
            <span className={styles.shadow} />
            <canvas ref={rimRef} className={styles.layer} />
            <canvas ref={cookieRef} className={styles.layer} />
          </span>
          <canvas ref={crumbsRef} className={styles.crumbs} aria-hidden="true" />
        </button>

        {showCount && (
          <div className={styles.overlay} aria-live="assertive">
            <span key={step} className={step === GO_STEP ? styles.go : styles.count}>
              {COUNTDOWN[step]}
            </span>
          </div>
        )}
        {stage === "over" && (
          <div className={styles.overlay} aria-live="assertive">
            <span className={styles.stamp}>¡TIEMPO!</span>
          </div>
        )}
      </div>

      <footer className={styles.bottom}>
        <p className={styles.hint} data-visible={stage === "countdown"}>
          ¡Tocá la cookie lo más rápido que puedas!
        </p>
        <p className={styles.eaten}>
          <span className={styles.eatenIcon} aria-hidden="true">
            🍪
          </span>
          <span ref={cookiesRef} className={styles.eatenValue}>
            0
          </span>
          <span className={styles.eatenLabel}>cookies comidas</span>
        </p>
      </footer>
    </div>
  );
}
