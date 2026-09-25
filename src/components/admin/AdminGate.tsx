"use client";

import Link from "next/link";
import { useRef } from "react";
import { Brand } from "@/components/brand/Brand";
import { BiteableCookie } from "@/components/cookie/BiteableCookie";
import { ADMIN_GATE_COOKIE } from "@/lib/admin/gate";
import styles from "./AdminGate.module.css";

type AdminGateProps = {
  next: string;
  logoSrc: string | null;
  cookie: { src: string | null; isCutout: boolean; alt: string };
};

/** "Antes de entrar... primero una cookie." — paso de UX, no de seguridad. */
export function AdminGate({ next, logoSrc, cookie }: AdminGateProps) {
  const enterRef = useRef<HTMLAnchorElement>(null);

  const handleComplete = () => {
    // Cookie de sesión del navegador, solo para /admin: recuerda que ya pasó por acá.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ADMIN_GATE_COOKIE}=1; Path=/admin; SameSite=Lax${secure}`;
    // Esperar a que se monte el botón y darle el foco.
    window.requestAnimationFrame(() => enterRef.current?.focus());
  };

  return (
    <main id="contenido" className={styles.gate}>
      <Link href="/" className={styles.logo} aria-label="Sweet Cookies, volver a la web">
        <Brand logoSrc={logoSrc} size="sm" decorative />
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Antes de entrar...</h1>
        <p className={styles.lead}>Primero una cookie.</p>
      </header>

      <div className={styles.cookie}>
        <BiteableCookie
          src={cookie.src}
          isCutout={cookie.isCutout}
          alt={cookie.alt}
          hint="Tres mordidas y entrás."
          showProgress
          priority
          sizes="(min-width: 640px) 340px, 70vw"
          onComplete={handleComplete}
          completeContent={
            <Link ref={enterRef} href={next} className={styles.enter}>
              Entrar al dashboard
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          }
        />
      </div>
    </main>
  );
}
