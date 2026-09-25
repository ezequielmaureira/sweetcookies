"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./BiteableCookie.module.css";

/**
 * Mordiscos alrededor del borde (ángulo en grados, 0 = derecha, sentido horario).
 * Cada mordisco se dibuja con 3 círculos superpuestos → borde "festoneado" real.
 */
const BITES = [-40, 150, 40, 235, 95, 300];
const BITE_RADIUS = 13; // % del tamaño de la cookie
const THROTTLE_MS = 220;
const RESET_MS = 650;

type Crumb = { id: number; x: number; y: number; dx: number; dy: number; size: number; delay: number };

function biteCircles(angle: number) {
  return [-8, 0, 8].map((offset, i) => {
    const rad = ((angle + offset) * Math.PI) / 180;
    const distance = 50 + (i === 1 ? 2 : -1); // % desde el centro (ligeramente por fuera del borde)
    return { x: 50 + Math.cos(rad) * distance, y: 50 + Math.sin(rad) * distance, r: i === 1 ? BITE_RADIUS : BITE_RADIUS * 0.82 };
  });
}

/** Máscara CSS: cada círculo es un "agujero"; se intersectan con una capa opaca. */
function maskFor(bites: number) {
  const holes = BITES.slice(0, bites).flatMap(biteCircles);
  if (!holes.length) return undefined;
  const layers = holes.map(
    ({ x, y, r }) => `radial-gradient(ellipse ${r}% ${r}% at ${x.toFixed(2)}% ${y.toFixed(2)}%, transparent 97%, #000 100%)`,
  );
  const value = [...layers, "linear-gradient(#000, #000)"].join(", ");
  return { maskImage: value, WebkitMaskImage: value } as React.CSSProperties;
}

type BiteableCookieProps = {
  /** Foto de cookie recortada (PNG sin fondo) si existe: se muestra entera. */
  cutoutSrc: string | null;
  /** Foto real de cookie (vista cenital): se recorta en círculo. */
  photoSrc: string | null;
  alt: string;
};

/**
 * Interacción principal del Hero: cada click/tap le da un mordisco a la cookie.
 * Al terminarla, aparece otra. Funciona con mouse, touch y teclado.
 */
export function BiteableCookie({ cutoutSrc, photoSrc, alt }: BiteableCookieProps) {
  const [bites, setBites] = useState(0);
  const [finished, setFinished] = useState(false);
  const [chomp, setChomp] = useState(0);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [message, setMessage] = useState("");
  const last = useRef(0);
  const crumbId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const bite = () => {
    const now = Date.now();
    if (finished || now - last.current < THROTTLE_MS) return;
    last.current = now;

    const next = bites + 1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setBites(next);
    setChomp((n) => n + 1);

    if (!reduced) {
      const angle = (BITES[next - 1] * Math.PI) / 180;
      const x = 50 + Math.cos(angle) * 46;
      const y = 50 + Math.sin(angle) * 46;
      const fresh: Crumb[] = Array.from({ length: 6 }, (_, i) => ({
        id: ++crumbId.current,
        x,
        y,
        dx: Math.cos(angle) * (18 + Math.random() * 26) + (Math.random() - 0.5) * 30,
        dy: 40 + Math.random() * 50,
        size: 3 + Math.random() * 4,
        delay: i * 18,
      }));
      setCrumbs((prev) => [...prev, ...fresh]);
      later(() => setCrumbs((prev) => prev.filter((c) => !fresh.includes(c))), 1000);
    }

    if (next >= BITES.length) {
      setFinished(true);
      setMessage("Te la comiste. Acá va otra.");
      later(() => {
        setBites(0);
        setFinished(false);
      }, reduced ? 300 : RESET_MS);
    } else {
      setMessage(next === 1 ? "Mmm." : "");
    }
  };

  const src = cutoutSrc ?? photoSrc;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={[styles.cookie, cutoutSrc ? styles.cutout : styles.round, finished ? styles.finished : ""].join(" ")}
        onClick={bite}
        aria-label={`Darle un mordisco a la cookie (${bites} de ${BITES.length})`}
      >
        {/* La key reinicia el "chomp" en cada mordisco. */}
        <span key={chomp} className={[styles.body, chomp > 0 ? styles.chomp : ""].join(" ")} style={maskFor(bites)}>
          {src ? (
            <Image
              src={src}
              alt={alt}
              fill
              priority
              sizes="(min-width: 1024px) 460px, 80vw"
              className={cutoutSrc ? styles.imgContain : styles.imgCover}
            />
          ) : (
            <span className={styles.placeholder} role="img" aria-label={alt}>
              <span className={styles.chips} aria-hidden="true" />
            </span>
          )}
        </span>
      </button>

      <span className={styles.crumbs} aria-hidden="true">
        {crumbs.map((c) => (
          <span
            key={c.id}
            className={styles.crumb}
            style={
              {
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: c.size,
                height: c.size,
                "--dx": `${c.dx}px`,
                "--dy": `${c.dy}px`,
                animationDelay: `${c.delay}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </span>

      <p className={styles.hint} aria-live="polite">
        <span className={bites === 0 && !finished ? styles.hintVisible : styles.hintHidden}>Tocá la cookie</span>
        <span className="visually-hidden">{message}</span>
      </p>
    </div>
  );
}
