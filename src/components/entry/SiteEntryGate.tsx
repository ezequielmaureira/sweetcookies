"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Brand } from "@/components/brand/Brand";
import { BiteableCookie } from "@/components/cookie/BiteableCookie";
import { ENTRY_ATTRIBUTE, hasEntered, markEntered } from "@/lib/entry-gate";
import styles from "./SiteEntryGate.module.css";

const FADE_MS = 650;
const FADE_REDUCED_MS = 150;

const ENTRY_MESSAGES = ["Mmm...", "Una más.", "Ya casi.", "Bueno... ahora sí."] as const;

// Estado "ya entró" leído de sessionStorage. En el servidor (y al hidratar) es
// false; el script de <head> ya ocultó la entrada por CSS si correspondía.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getEntered = () => hasEntered(window.sessionStorage);
const getServerEntered = () => false;

type SiteEntryGateProps = {
  logoSrc: string | null;
  cookie: { src: string | null; isCutout: boolean; alt: string };
  children: React.ReactNode;
};

/**
 * Puerta de entrada pública de Sweet Cookies: pantalla completa con la cookie
 * real; 4 mordidas y se revela la página pedida (sin recargar ni redirigir).
 * Es solo UX: no protege nada ni sabe de sesiones de usuario.
 */
export function SiteEntryGate({ logoSrc, cookie, children }: SiteEntryGateProps) {
  const entered = useSyncExternalStore(subscribe, getEntered, getServerEntered);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleComplete = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    markEntered(window.sessionStorage);
    window.scrollTo(0, 0);
    setLeaving(true);
    listeners.forEach((listener) => listener());
    timer.current = window.setTimeout(() => {
      document.documentElement.setAttribute(ENTRY_ATTRIBUTE, "");
      setLeaving(false);
    }, reduced ? FADE_REDUCED_MS : FADE_MS);
  };

  const showGate = !entered || leaving;

  return (
    <>
      {/* Mientras la entrada está abierta, la página queda fuera del foco y del lector de pantalla. */}
      <div className={styles.page} inert={showGate && !leaving}>
        {children}
      </div>

      {showGate && (
        <div
          className={`${styles.gate} ${leaving ? styles.leaving : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Bienvenida a Sweet Cookies"
        >
          <div className={styles.logo}>
            <Brand logoSrc={logoSrc} size="lg" />
          </div>
          <div className={styles.cookie}>
            <BiteableCookie
              src={cookie.src}
              isCutout={cookie.isCutout}
              alt={cookie.alt}
              hint="Probala para entrar."
              messages={ENTRY_MESSAGES}
              priority
              sizes="(min-width: 1024px) 560px, 86vw"
              onComplete={handleComplete}
            />
          </div>
        </div>
      )}
    </>
  );
}
