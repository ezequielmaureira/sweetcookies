import { ButtonLink } from "@/components/ui/Button";
import { CookieImage } from "@/components/ui/CookieImage";
import { Parallax } from "@/components/ui/Parallax";
import { routes, sectionIds } from "@/data/site";
import styles from "./BuildBoxSection.module.css";

type BuildBoxSectionProps = {
  imageSrc: string | null;
  title?: string;
  text?: string;
  ctaLabel?: string;
  /** Destino del CTA (por defecto, el constructor de caja). */
  ctaHref?: string;
  /** Contenido alternativo al CTA (si se pasa, lo reemplaza). */
  children?: React.ReactNode;
};

export function BuildBoxSection({
  imageSrc,
  title = "Armá tu caja",
  text = "Elegí tus cookies favoritas y creá tu combinación.",
  ctaLabel = "Empezar",
  ctaHref = routes.buildBox,
  children,
}: BuildBoxSectionProps) {
  return (
    <section id={sectionIds.buildBox} className={styles.section} aria-labelledby="build-box-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.media} data-reveal>
          <Parallax speed={0.035} className={styles.parallax}>
            <div className={styles.photo}>
              <CookieImage
                src={imageSrc}
                alt="Caja de Sweet Cookies con cookies surtidas"
                sizes="(min-width: 1024px) 720px, 100vw"
                placeholderLabel="Foto de la caja"
              />
            </div>
          </Parallax>
        </div>

        <div className={styles.copy} data-reveal style={{ "--reveal-delay": "120ms" } as React.CSSProperties}>
          <h2 id="build-box-title" className={styles.title}>
            {title}
          </h2>
          <p className={styles.text}>{text}</p>
          {children ?? (
            <ButtonLink href={ctaHref} arrow className={styles.cta}>
              {ctaLabel}
            </ButtonLink>
          )}
        </div>
      </div>
    </section>
  );
}
