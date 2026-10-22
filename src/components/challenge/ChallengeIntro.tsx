import Image from "next/image";
import Link from "next/link";
import { Brand } from "@/components/brand/Brand";
import type { ChallengeCookie } from "./useCookieImage";
import shared from "./Challenge.module.css";
import styles from "./ChallengeIntro.module.css";

/** Migas decorativas alrededor de la cookie (posiciones fijas, en % del contenedor). */
const DECOR = [
  { x: 4, y: 30, size: 12, rotate: 18, tone: 0 },
  { x: 12, y: 74, size: 8, rotate: -24, tone: 2 },
  { x: 2, y: 56, size: 6, rotate: 40, tone: 1 },
  { x: 88, y: 18, size: 9, rotate: 12, tone: 1 },
  { x: 95, y: 48, size: 13, rotate: -30, tone: 0 },
  { x: 84, y: 82, size: 7, rotate: 64, tone: 2 },
  { x: 30, y: 96, size: 6, rotate: 10, tone: 1 },
  { x: 66, y: 98, size: 9, rotate: -50, tone: 0 },
] as const;

type ChallengeIntroProps = {
  cookie: ChallengeCookie | null;
  logoSrc: string | null;
  ready: boolean;
  failed: boolean;
  onPlay: () => void;
  onRetry: () => void;
};

export function ChallengeIntro({ cookie, logoSrc, ready, failed, onPlay, onRetry }: ChallengeIntroProps) {
  return (
    <main id="contenido" className={styles.intro}>
      <header className={styles.top}>
        <Link href="/" className={styles.homeLink} aria-label="Ir a Sweet Cookies">
          <Brand logoSrc={logoSrc} size="sm" decorative />
        </Link>
        <span className={styles.demoTag}>Versión demo</span>
      </header>

      <section className={styles.hero} aria-labelledby="challenge-title">
        <p className={`${styles.eyebrow} ${styles.enter}`} style={{ "--d": "60ms" } as React.CSSProperties}>
          Sweet Cookies presenta
        </p>
        <h1 id="challenge-title" className={`${styles.title} ${styles.enter}`} style={{ "--d": "140ms" } as React.CSSProperties}>
          <span>Sweet Click</span>
          <span className={styles.titleAccent}>Challenge</span>
        </h1>
        <p className={`${styles.lead} ${styles.enter}`} style={{ "--d": "240ms" } as React.CSSProperties}>
          ¿Cuántas cookies podés devorar en 15 segundos?
        </p>

        <div className={styles.cookieWrap}>
          <span className={styles.glow} aria-hidden="true" />
          {DECOR.map((crumb, i) => (
            <span
              key={i}
              className={`${styles.decor} ${styles[`tone${crumb.tone}`]}`}
              style={
                {
                  left: `${crumb.x}%`,
                  top: `${crumb.y}%`,
                  width: crumb.size,
                  height: crumb.size,
                  "--r": `${crumb.rotate}deg`,
                  "--d": `${300 + i * 70}ms`,
                } as React.CSSProperties
              }
              aria-hidden="true"
            />
          ))}
          <div className={styles.cookie}>
            {cookie ? (
              <Image
                src={cookie.path}
                alt={cookie.alt}
                fill
                sizes={cookie.sizes}
                preload
                draggable={false}
                className={cookie.isCutout ? styles.cutout : styles.round}
              />
            ) : (
              <span className={styles.missing}>Foto de la cookie</span>
            )}
          </div>
        </div>

        <div className={`${styles.actions} ${styles.enter}`} style={{ "--d": "380ms" } as React.CSSProperties}>
          {failed ? (
            <>
              <button type="button" className={shared.cta} onClick={onRetry} disabled={!cookie}>
                Reintentar
              </button>
              <p className={styles.status} role="alert">
                {cookie ? "No pudimos cargar la cookie. Revisá tu conexión." : "Falta la foto de la cookie."}
              </p>
            </>
          ) : (
            <button type="button" className={`${shared.cta} ${styles.play}`} onClick={onPlay} disabled={!ready}>
              {ready ? "¡Quiero jugar!" : "Horneando…"}
            </button>
          )}
        </div>

        <div className={`${styles.prize} ${styles.enter}`} style={{ "--d": "460ms" } as React.CSSProperties}>
          <p className={styles.prizeTitle}>🏆 Ganate una caja de 3 cookies</p>
          <p className={styles.prizeNote}>Próximamente: campeonato exclusivo para Río Cuarto.</p>
        </div>

        <ul className={`${styles.rules} ${styles.enter}`} style={{ "--d": "540ms" } as React.CSSProperties}>
          <li>
            <strong>15 seg</strong>
            para comer todo lo que puedas
          </li>
          <li>
            <strong>1 toque</strong>
            es una mordida
          </li>
          <li>
            <strong>30 mordidas</strong>
            es una cookie
          </li>
        </ul>
      </section>
    </main>
  );
}
