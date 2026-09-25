"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./BeagleMascot.module.css";

/** Frases posteriores a comer (una por interacción). */
const PHRASES = ["Mmm.", "Otra.", "Esta estaba buena.", "🍪"];

/** Duraciones (ms). Deben coincidir con --eat-duration / --eat-duration-reduced del CSS. */
const EAT_MS = 1800;
const EAT_REDUCED_MS = 900;
/** Momento de la secuencia en el que aparece la frase (cara feliz). */
const PHRASE_AT = 0.72;
const PHRASE_VISIBLE_MS = 1700;

type Phase = "idle" | "eating" | "fed";

type BeagleMascotProps = {
  /**
   * "hero": el beagle pide una cookie (burbuja inicial "¿Me das una?").
   * "gazing": el beagle mira una cookie que tiene al lado (CTA final).
   */
  variant?: "hero" | "gazing";
  /** Texto inicial de la burbuja. null para no mostrarla. */
  initialBubble?: string | null;
  bubbleSide?: "right" | "left";
  className?: string;
};

export function BeagleMascot({
  variant = "hero",
  initialBubble = "¿Me das una?",
  bubbleSide = "right",
  className,
}: BeagleMascotProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [bubble, setBubble] = useState<string | null>(initialBubble);
  const [bubbleVisible, setBubbleVisible] = useState(Boolean(initialBubble));
  const busy = useRef(false);
  const lastPhrase = useRef<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const feed = useCallback(() => {
    // Bloquea clicks repetidos hasta terminar la secuencia anterior.
    if (busy.current) return;
    busy.current = true;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const later = (fn: () => void, ms: number) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? EAT_REDUCED_MS : EAT_MS;

    const options = PHRASES.filter((p) => p !== lastPhrase.current);
    const phrase = options[Math.floor(Math.random() * options.length)];
    lastPhrase.current = phrase;

    setBubbleVisible(false);
    setPhase("eating");

    later(() => {
      setBubble(phrase);
      setBubbleVisible(true);
    }, duration * PHRASE_AT);

    later(() => {
      setPhase("fed");
      busy.current = false;
    }, duration);

    later(() => setBubbleVisible(false), duration * PHRASE_AT + PHRASE_VISIBLE_MS);
  }, []);

  const rootClass = [
    styles.root,
    styles[variant],
    bubbleSide === "left" ? styles.bubbleLeft : "",
    phase === "eating" ? styles.eating : "",
    phase === "fed" ? styles.fed : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <button
        type="button"
        className={styles.button}
        onClick={feed}
        aria-label="Darle una cookie al beagle"
        aria-disabled={phase === "eating"}
      >
        <BeagleSvg />
      </button>

      <p className={[styles.bubble, bubbleVisible && bubble ? styles.bubbleVisible : ""].join(" ")} aria-live="polite">
        {bubble}
      </p>
    </div>
  );
}

/**
 * Ilustración original del beagle (SVG propio).
 * Las partes animables llevan clases del módulo CSS; los colores salen de
 * variables CSS para mantener coherencia con la marca.
 */
function BeagleSvg() {
  return (
    <svg className={styles.svg} viewBox="0 0 200 184" aria-hidden="true" focusable="false">
      {/* Cuerpo / hombros */}
      <g className={styles.body}>
        {/* Cuello: une cabeza y hombros */}
        <path className={styles.tan} d="M78 110h44v30H78Z" />
        <path className={styles.tan} d="M44 184c2-30 20-50 56-50s54 20 56 50Z" />
        <path className={styles.saddle} d="M44 184c1-16 7-29 17-37 6 12 5 26 3 37Z" />
        <path className={styles.saddle} d="M156 184c-1-16-7-29-17-37-6 12-5 26-3 37Z" />
        <path className={styles.white} d="M78 184c0-22 8-38 22-38s22 16 22 38Z" />
        <path className={styles.outline} d="M44 184c2-30 20-50 56-50s54 20 56 50" />
        {/* Collar terracota */}
        <path className={styles.collar} d="M66 134c20 11 48 11 68 0l3 8c-22 13-52 13-74 0Z" />
        <circle className={styles.tag} cx="100" cy="148" r="4.5" />
      </g>

      <g className={styles.head}>
        {/* Orejas */}
        <g className={styles.earLeft}>
          <path className={styles.ear} d="M62 48c-16-2-28 12-30 36-2 22 4 40 16 42 11 2 17-10 18-26 1-18 2-38-4-52Z" />
          <path className={styles.outline} d="M62 48c-16-2-28 12-30 36-2 22 4 40 16 42 11 2 17-10 18-26 1-18 2-38-4-52Z" />
        </g>
        <g className={styles.earRight}>
          <path className={styles.ear} d="M138 48c16-2 28 12 30 36 2 22-4 40-16 42-11 2-17-10-18-26-1-18-2-38 4-52Z" />
          <path className={styles.outline} d="M138 48c16-2 28 12 30 36 2 22-4 40-16 42-11 2-17-10-18-26-1-18-2-38 4-52Z" />
        </g>

        {/* Cabeza */}
        <path className={styles.tan} d="M58 70c0-30 18-50 42-50s42 20 42 50c0 30-16 52-42 54-26-2-42-24-42-54Z" />
        {/* Franja blanca y hocico */}
        <path
          className={styles.white}
          d="M95 24c3-1 7-1 10 0l3 50c14 6 22 18 20 32-3 14-16 20-28 20s-25-6-28-20c-2-14 6-26 20-32Z"
        />
        <path
          className={styles.outline}
          d="M58 70c0-30 18-50 42-50s42 20 42 50c0 30-16 52-42 54-26-2-42-24-42-54Z"
        />

        {/* Rubor (solo en la expresión feliz) */}
        <ellipse className={styles.blush} cx="76" cy="96" rx="6" ry="3.5" />
        <ellipse className={styles.blush} cx="124" cy="96" rx="6" ry="3.5" />

        {/* Ojos normales */}
        <g className={styles.eyes}>
          <g className={styles.pupils}>
            <circle className={styles.dark} cx="82" cy="72" r="5.2" />
            <circle className={styles.dark} cx="118" cy="72" r="5.2" />
            <circle className={styles.shine} cx="83.8" cy="70.2" r="1.6" />
            <circle className={styles.shine} cx="119.8" cy="70.2" r="1.6" />
          </g>
        </g>
        {/* Ojos felices */}
        <g className={styles.eyesHappy}>
          <path className={styles.stroke} d="M76 74q6-7 12 0" />
          <path className={styles.stroke} d="M112 74q6-7 12 0" />
        </g>
        {/* Cejas sutiles */}
        <path className={styles.brow} d="M76 61q6-3 11-1" />
        <path className={styles.brow} d="M124 61q-6-3-11-1" />

        {/* Boca abierta (escala en Y desde arriba) */}
        <g className={styles.mouthOpen}>
          <path className={styles.mouthInside} d="M90 101c0-2 20-2 20 0 0 8-4 13-10 13s-10-5-10-13Z" />
          <path className={styles.tongue} d="M94 109c2-3 10-3 12 0-1 3-3 5-6 5s-5-2-6-5Z" />
        </g>

        {/* Mandíbula: sonrisa cerrada + mentón (se mueve al masticar) */}
        <g className={styles.jaw}>
          <path className={styles.smile} d="M100 99v4M90 104q5 5 10 0q5 5 10 0" />
        </g>

        {/* Nariz */}
        <path className={styles.nose} d="M91 92c0-5 18-5 18 0 0 5-5 9-9 9s-9-4-9-9Z" />
        <ellipse className={styles.shine} cx="96" cy="91" rx="2.2" ry="1.2" />
      </g>

      {/* Cookie que el beagle come. Se dibuja centrada en la boca (100,104). */}
      <g transform="translate(100 104)">
        <g className={styles.cookie}>
          <circle className={styles.cookieBase} r="11" />
          <circle className={styles.cookieEdge} r="11" />
          <circle className={styles.chip} cx="-4" cy="-3" r="1.8" />
          <circle className={styles.chip} cx="4" cy="-5" r="1.4" />
          <circle className={styles.chip} cx="3.5" cy="3.5" r="2" />
          <circle className={styles.chip} cx="-4" cy="5" r="1.3" />
        </g>
      </g>

      {/* Miguitas */}
      <g transform="translate(100 112)">
        <circle className={`${styles.crumb} ${styles.crumb1}`} r="1.8" />
        <circle className={`${styles.crumb} ${styles.crumb2}`} r="1.3" />
        <circle className={`${styles.crumb} ${styles.crumb3}`} r="1.6" />
        <circle className={`${styles.crumb} ${styles.crumb4}`} r="1.1" />
      </g>
    </svg>
  );
}
