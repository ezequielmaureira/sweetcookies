import Image from "next/image";
import { ButtonLink } from "@/components/ui/Button";
import { Parallax } from "@/components/ui/Parallax";
import { routes, sectionIds } from "@/data/site";
import styles from "./Hero.module.css";

type HeroProps = {
  /** Foto REAL de la cookie del hero (recorte PNG o foto cenital). */
  cookieSrc: string | null;
  isCutout: boolean;
  imageAlt: string;
};

export function Hero({ cookieSrc, isCutout, imageAlt }: HeroProps) {
  return (
    <section id={sectionIds.home} className={styles.hero} aria-labelledby="hero-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <p className={`kicker ${styles.enter}`} style={{ "--d": "80ms" } as React.CSSProperties}>
            Cookies artesanales
          </p>
          <h1 id="hero-title" className={styles.title}>
            <span className={styles.enter} style={{ "--d": "160ms" } as React.CSSProperties}>
              Cookies hechas
            </span>{" "}
            <span className={styles.enter} style={{ "--d": "260ms" } as React.CSSProperties}>
              para darte un gusto.
            </span>
          </h1>
          <p className={`${styles.lead} ${styles.enter}`} style={{ "--d": "380ms" } as React.CSSProperties}>
            Cookies artesanales, combinaciones únicas y mucho sabor.
          </p>
          <div className={`${styles.actions} ${styles.enter}`} style={{ "--d": "480ms" } as React.CSSProperties}>
            <ButtonLink href={`#${sectionIds.flavors}`}>Ver sabores</ButtonLink>
            <ButtonLink href={routes.buildBox} variant="secondary" arrow>
              Armá tu caja
            </ButtonLink>
          </div>
        </div>

        <div className={styles.media}>
          <Parallax speed={0.04} className={styles.stage}>
            {/* La interacción de mordidas ya ocurrió en la entrada: acá la cookie es solo producto. */}
            <div className={`${styles.cookie} ${isCutout ? styles.cutout : styles.round}`}>
              {cookieSrc && (
                <Image
                  src={cookieSrc}
                  alt={imageAlt}
                  fill
                  priority
                  draggable={false}
                  sizes="(min-width: 1024px) 540px, 86vw"
                  className={styles.cookieImage}
                />
              )}
            </div>
          </Parallax>
        </div>
      </div>
    </section>
  );
}
