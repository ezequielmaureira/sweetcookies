import { BeagleMascot } from "@/components/beagle/BeagleMascot";
import { ButtonLink } from "@/components/ui/Button";
import { CookieImage } from "@/components/ui/CookieImage";
import { Parallax } from "@/components/ui/Parallax";
import { routes, sectionIds } from "@/data/site";
import styles from "./Hero.module.css";

type HeroProps = {
  /** Foto real principal, o null para el placeholder. */
  imageSrc: string | null;
  imageAlt: string;
};

export function Hero({ imageSrc, imageAlt }: HeroProps) {
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
              para darte <em>un gusto.</em>
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
          <Parallax speed={0.05} className={styles.parallax}>
            <figure className={styles.photo}>
              <CookieImage
                src={imageSrc}
                alt={imageAlt}
                priority
                sizes="(min-width: 1024px) 560px, (min-width: 640px) 70vw, 88vw"
                placeholderLabel="Foto de la cookie"
              />
            </figure>
          </Parallax>
          <BeagleMascot className={styles.beagle} />
        </div>
      </div>
    </section>
  );
}
