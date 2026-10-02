import { Fragment } from "react";
import { BiteableCookie } from "@/components/cookie/BiteableCookie";
import { ButtonLink } from "@/components/ui/Button";
import { Parallax } from "@/components/ui/Parallax";
import { routes, sectionIds } from "@/data/site";
import { textLines, type SiteTexts } from "@/lib/site-content";
import styles from "./Hero.module.css";

type HeroProps = {
  /** Foto REAL de la cookie del hero (recorte PNG o foto cenital). */
  cookieSrc: string | null;
  isCutout: boolean;
  imageAlt: string;
  /** Textos editables desde el panel (Configuración → Textos del sitio). */
  texts: SiteTexts;
};

export function Hero({ cookieSrc, isCutout, imageAlt, texts }: HeroProps) {
  return (
    <section id={sectionIds.home} className={styles.hero} aria-labelledby="hero-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <p className={`kicker ${styles.enter}`} style={{ "--d": "80ms" } as React.CSSProperties}>
            {texts.HOME_EYEBROW}
          </p>
          <h1 id="hero-title" className={styles.title}>
            {/* Cada renglón del título es una línea, con la misma entrada escalonada (160 ms, 260 ms…). */}
            {textLines(texts.HOME_TITLE).map((line, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span className={styles.enter} style={{ "--d": `${160 + i * 100}ms` } as React.CSSProperties}>
                  {line}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className={`${styles.lead} ${styles.enter}`} style={{ "--d": "380ms" } as React.CSSProperties}>
            {texts.HOME_DESCRIPTION}
          </p>
          <div className={`${styles.actions} ${styles.enter}`} style={{ "--d": "480ms" } as React.CSSProperties}>
            <ButtonLink href={`#${sectionIds.flavors}`}>{texts.HOME_PRIMARY_CTA}</ButtonLink>
            <ButtonLink href={routes.buildBox} variant="secondary" arrow>
              {texts.HOME_SECONDARY_CTA}
            </ButtonLink>
          </div>
        </div>

        <div className={styles.media}>
          <Parallax speed={0.04} className={styles.stage}>
            {/* Ya dentro del sitio se puede seguir comiendo: 4 mordidas y "¿Otra?" la vuelve a llenar. */}
            <div className={styles.cookie}>
              <BiteableCookie
                src={cookieSrc}
                isCutout={isCutout}
                alt={imageAlt}
                hint={texts.HOME_COOKIE_LABEL}
                messages={[texts.HOME_COOKIE_BITE_ONE, texts.HOME_COOKIE_BITE_TWO, texts.HOME_COOKIE_BITE_THREE, texts.HOME_COOKIE_FINAL]}
                resetLabel={texts.HOME_COOKIE_RESET}
                priority
                sizes="(min-width: 1024px) 540px, 86vw"
              />
            </div>
          </Parallax>
        </div>
      </div>
    </section>
  );
}
