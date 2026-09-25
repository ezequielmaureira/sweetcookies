"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { BITE_COUNT, DEFAULT_MESSAGES, biteMask, bitePoint } from "./bites";
import styles from "./BiteableCookie.module.css";

const THROTTLE_MS = 350;
const COMPLETE_DELAY_MS = 900;
const COMPLETE_DELAY_REDUCED_MS = 250;

type Crumb = { id: number; x: number; y: number; dx: number; dy: number; size: number; delay: number; tone: number };

type BiteableCookieProps = {
  /** Foto REAL de la cookie. */
  src: string | null;
  /** true si la foto es un recorte sin fondo (PNG); si no, se recorta en círculo. */
  isCutout?: boolean;
  alt: string;
  /** Texto antes del primer mordisco. */
  hint?: string;
  messages?: readonly [string, string, string];
  /** Indicador de 3 mordidas (pantalla de acceso). */
  showProgress?: boolean;
  /** Contenido al terminar (ej. CTA). */
  completeContent?: React.ReactNode;
  onComplete?: () => void;
  sizes?: string;
  priority?: boolean;
};

/**
 * Cookie real que se muerde con click, tap, Enter o Space (botón nativo).
 * 3 mordidas → mensaje final → contenido de cierre. Clicks rápidos se ignoran
 * durante THROTTLE_MS para no saltear estados.
 */
export function BiteableCookie({
  src,
  isCutout = false,
  alt,
  hint = "Tocá la cookie",
  messages = DEFAULT_MESSAGES,
  showProgress = false,
  completeContent,
  onComplete,
  sizes = "(min-width: 1024px) 460px, 80vw",
  priority = false,
}: BiteableCookieProps) {
  const [bites, setBites] = useState(0);
  const [complete, setComplete] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const last = useRef(0);
  const crumbId = useRef(0);
  const timers = useRef<number[]>([]);
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
      const { x, y } = bitePoint(next - 1);
      const fresh: Crumb[] = Array.from({ length: 7 }, (_, i) => ({
        id: ++crumbId.current,
        x,
        y,
        dx: (x - 50) * (0.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 36,
        dy: 30 + Math.random() * 60,
        size: 2.5 + Math.random() * 4.5,
        delay: i * 16,
        tone: i % 3,
      }));
      setCrumbs((prev) => [...prev, ...fresh]);
      timers.current.push(window.setTimeout(() => setCrumbs((prev) => prev.filter((c) => !fresh.includes(c))), 1100));
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

  const mask = biteMask(bites);
  const rimMask = biteMask(bites, 1.4);
  const maskStyle = (value: string | undefined) =>
    value ? ({ maskImage: value, WebkitMaskImage: value } as React.CSSProperties) : undefined;
  const message = bites === 0 ? hint : messages[bites - 1];
  const done = bites >= BITE_COUNT;

  const photo = (className: string, style?: React.CSSProperties) => (
    <span className={`${styles.layer} ${className}`} style={style} aria-hidden="true">
      {src ? (
        <Image src={src} alt="" fill priority={priority} sizes={sizes} className={isCutout ? styles.contain : styles.cover} />
      ) : (
        <span className={styles.missing} />
      )}
    </span>
  );

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <button
          type="button"
          className={[styles.cookie, isCutout ? styles.cutout : styles.round, done ? styles.done : ""].join(" ")}
          onClick={bite}
          aria-disabled={done}
          aria-label={done ? `${alt}. Cookie terminada.` : `${alt}. Dar un mordisco (${bites} de ${BITE_COUNT}).`}
        >
          {/* Capa inferior más oscura: el "interior" expuesto en el borde de cada mordida. */}
          {bites > 0 && photo(styles.rim, maskStyle(rimMask))}
          {/* key: reinicia la animación de mordida en cada paso. */}
          <span key={bites} className={`${styles.body} ${bites > 0 ? styles.chomp : ""}`} style={maskStyle(mask)}>
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
                  height: c.size * 0.8,
                  "--dx": `${c.dx}px`,
                  "--dy": `${c.dy}px`,
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
        {showProgress && (
          <ol className={styles.progress} aria-label={`Mordidas: ${bites} de ${BITE_COUNT}`}>
            {Array.from({ length: BITE_COUNT }, (_, i) => (
              <li key={i} className={i < bites ? styles.progressDone : undefined} />
            ))}
          </ol>
        )}
      </div>

      {complete && completeContent && <div className={styles.complete}>{completeContent}</div>}
    </div>
  );
}
