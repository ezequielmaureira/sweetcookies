"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { BITE_COUNT, DEFAULT_MESSAGES, biteMask, crumbOrigins, type BiteMessages } from "./bites";
import styles from "./BiteableCookie.module.css";

const THROTTLE_MS = 350;
/** Pocas miguitas por mordida: sutil, nada explosivo. */
const CRUMB_COUNT = 4;
/** Cuánto se achica el agujero en la capa de miga expuesta (en % de la cookie). */
const RIM_INSET = 1.7;
/** Pausa tras la última mordida para leer el mensaje antes de continuar. */
const COMPLETE_DELAY_MS = 550;
const COMPLETE_DELAY_REDUCED_MS = 250;

type Crumb = {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  spin: number;
  size: number;
  delay: number;
  tone: number;
  shape: string;
};

/** Contorno irregular de una miguita (nada de círculos perfectos). */
function crumbShape() {
  const corners = 5 + Math.floor(Math.random() * 3);
  return `polygon(${Array.from({ length: corners }, (_, i) => {
    const a = (i / corners) * Math.PI * 2 + Math.random() * 0.5;
    const r = 34 + Math.random() * 16;
    return `${(50 + Math.cos(a) * r).toFixed(0)}% ${(50 + Math.sin(a) * r).toFixed(0)}%`;
  }).join(",")})`;
}

type BiteableCookieProps = {
  /** Foto REAL de la cookie. */
  src: string | null;
  /** true si la foto es un recorte sin fondo (PNG); si no, se recorta en círculo. */
  isCutout?: boolean;
  alt: string;
  /** Texto antes del primer mordisco. */
  hint?: string;
  messages?: BiteMessages;
  onComplete?: () => void;
  /** Si se pasa, al terminar aparece este botón discreto que vuelve a la cookie entera. */
  resetLabel?: string;
  sizes?: string;
  priority?: boolean;
};

/**
 * Cookie real que se muerde con click, tap, Enter o Space (botón nativo).
 * 4 mordidas → mensaje final → onComplete (y opcionalmente "¿Otra?").
 * Clicks rápidos se ignoran durante THROTTLE_MS para no saltear estados.
 */
export function BiteableCookie({
  src,
  isCutout = false,
  alt,
  hint = "Tocá la cookie",
  messages = DEFAULT_MESSAGES,
  onComplete,
  resetLabel,
  sizes = "(min-width: 1024px) 460px, 80vw",
  priority = false,
}: BiteableCookieProps) {
  const [bites, setBites] = useState(0);
  const [complete, setComplete] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const last = useRef(0);
  const crumbId = useRef(0);
  const timers = useRef<number[]>([]);
  const cookieRef = useRef<HTMLButtonElement>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const bite = () => {
    const now = Date.now();
    if (bites >= BITE_COUNT || now - last.current < THROTTLE_MS) return;
    last.current = now;

    const next = bites + 1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setBites(next);

    if (!reduced) {
      // Caen desde el borde recién mordido, casi sin impulso: gravedad, no explosión.
      const fresh: Crumb[] = crumbOrigins(next - 1, CRUMB_COUNT).map(({ x, y }, i) => ({
        id: ++crumbId.current,
        x,
        y,
        dx: (x - 50) * 0.25 + (Math.random() - 0.5) * 14,
        dy: 26 + Math.random() * 30,
        spin: (Math.random() - 0.5) * 220,
        size: 2.5 + Math.random() * 3,
        delay: i * 45 + Math.random() * 40,
        tone: Math.random() < 0.2 ? 2 : i % 2,
        shape: crumbShape(),
      }));
      setCrumbs((prev) => [...prev, ...fresh]);
      timers.current.push(window.setTimeout(() => setCrumbs((prev) => prev.filter((c) => !fresh.includes(c))), 1200));
    }

    if (next === BITE_COUNT) {
      timers.current.push(
        window.setTimeout(() => {
          setComplete(true);
          onCompleteRef.current?.();
        }, reduced ? COMPLETE_DELAY_REDUCED_MS : COMPLETE_DELAY_MS),
      );
    }
  };

  const reset = () => {
    setBites(0);
    setComplete(false);
    setCrumbs([]);
    last.current = 0;
    cookieRef.current?.focus();
  };

  const mask = biteMask(bites);
  const rimMask = biteMask(bites, RIM_INSET);
  const maskStyle = (value: string | undefined) =>
    value ? ({ maskImage: value, WebkitMaskImage: value } as React.CSSProperties) : undefined;
  const message = bites === 0 ? hint : messages[bites - 1];
  const done = bites >= BITE_COUNT;

  const photo = (className: string, style?: React.CSSProperties) => (
    <span className={`${styles.layer} ${className}`} style={style} aria-hidden="true">
      {src ? (
        <Image src={src} alt="" fill draggable={false} priority={priority} sizes={sizes} className={isCutout ? styles.contain : styles.cover} />
      ) : (
        <span className={styles.missing} />
      )}
    </span>
  );

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <button
          ref={cookieRef}
          type="button"
          className={[styles.cookie, isCutout ? styles.cutout : styles.round, done ? styles.done : ""].join(" ")}
          onClick={bite}
          aria-disabled={done}
          aria-label={done ? `${alt}. Cookie terminada.` : `${alt}. Dar un mordisco (${bites} de ${BITE_COUNT}).`}
        >
          {/* Miga expuesta: la misma foto en tono de interior, asoma en el borde de cada mordida. */}
          {bites > 0 && photo(styles.rim, maskStyle(rimMask))}
          {/* Misma capa siempre (sin re-montar): al morder solo cambia la máscara, la cookie no se mueve. */}
          <span className={styles.body} style={maskStyle(mask)}>
            {photo(styles.top)}
          </span>
          {!src && <span className={styles.missingLabel}>Foto de la cookie</span>}
        </button>

        <span className={styles.crumbs} aria-hidden="true">
          {crumbs.map((c) => (
            <span
              key={c.id}
              className={`${styles.crumb} ${styles[`tone${c.tone}`]}`}
              style={
                {
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  width: c.size,
                  height: c.size,
                  clipPath: c.shape,
                  "--dx": `${c.dx}px`,
                  "--dy": `${c.dy}px`,
                  "--spin": `${c.spin}deg`,
                  animationDelay: `${c.delay}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      </div>

      <div className={styles.caption}>
        <p className={styles.message} aria-live="polite">
          <span key={bites} className={bites > 0 ? styles.messageIn : undefined}>
            {message}
          </span>
        </p>
        {resetLabel && complete && (
          <button type="button" className={styles.again} onClick={reset}>
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
