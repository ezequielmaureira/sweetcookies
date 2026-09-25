import Image from "next/image";
import { site } from "@/data/site";
import styles from "./Brand.module.css";

type BrandProps = {
  /** Logo real (public/images/cookies/logo-sweet-cookies.*) o null. */
  logoSrc: string | null;
  size?: "sm" | "md";
  /** true cuando el contenedor ya tiene nombre accesible (ej. link con aria-label). */
  decorative?: boolean;
  className?: string;
};

/**
 * Marca de Sweet Cookies. El logo se usa solo como identificador: no define
 * tipografía ni estilo del resto del sitio. Sin logo, un nombre en texto plano.
 */
export function Brand({ logoSrc, size = "md", decorative = false, className }: BrandProps) {
  const classes = [styles.brand, styles[size], className].filter(Boolean).join(" ");
  if (logoSrc) {
    return (
      <span className={`${classes} ${styles.logo}`}>
        <Image src={logoSrc} alt={decorative ? "" : site.name} fill sizes="180px" priority={size === "md"} />
      </span>
    );
  }
  return (
    <span className={`${classes} ${styles.wordmark}`} aria-hidden={decorative || undefined}>
      {site.name}
    </span>
  );
}
