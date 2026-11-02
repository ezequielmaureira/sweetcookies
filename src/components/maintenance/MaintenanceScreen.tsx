import Image from "next/image";
import { Brand } from "@/components/brand/Brand";
import { resolveMaintenanceCopy } from "./maintenance-copy";
import styles from "./MaintenanceScreen.module.css";

/**
 * Ruta fija (no resolveImage: usa fs, incompatible con el bundle de cliente
 * de la vista previa del admin). El archivo real es público/images/cookies/logo-sweet-cookies.png.
 */
const LOGO_SRC = "/images/cookies/logo-sweet-cookies.png";

type MaintenanceScreenProps = {
  title?: string | null;
  subtitle?: string | null;
  /** Para la vista previa del admin: reemplaza el alto de pantalla completa por el del contenedor. */
  className?: string;
};

/**
 * Pantalla pública de mantenimiento: fondo cálido tipo horno (gradiente CSS +
 * fotos reales de cookies ya existentes), el logo original de Sweet Cookies,
 * la frase y subfrase configurables, y el mensaje fijo "¡Volvemos muy pronto!".
 * Puramente presentacional: la usan tanto el gate público como la vista previa
 * del admin, para que el texto que se guarda sea siempre el que se ve.
 */
export function MaintenanceScreen({ title, subtitle, className }: MaintenanceScreenProps) {
  const copy = resolveMaintenanceCopy({ title, subtitle });

  return (
    <div className={[styles.screen, className].filter(Boolean).join(" ")}>
      <div className={styles.backdrop} aria-hidden="true">
        <div className={`${styles.corner} ${styles.cornerTl}`}>
          <Image src="/images/cookies/chocotorta.jpg" alt="" fill sizes="60vmin" className={styles.cornerImg} />
        </div>
        <div className={`${styles.corner} ${styles.cornerBr}`}>
          <Image src="/images/cookies/red-velvet.jpg" alt="" fill sizes="60vmin" className={styles.cornerImg} />
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.logo}>
          <Brand logoSrc={LOGO_SRC} size="lg" decorative />
        </div>

        <p className={styles.title}>
          <span className={styles.spark} aria-hidden="true">
            ✦
          </span>
          {copy.title}
          <span className={styles.spark} aria-hidden="true">
            ✦
          </span>
        </p>

        <div className={styles.divider} aria-hidden="true">
          <span className={styles.dividerLine} />
          <span className={styles.heart}>♥</span>
          <span className={styles.dividerLine} />
        </div>

        <p className={styles.subtitle}>{copy.subtitle}</p>

        <p className={styles.pill}>
          <span aria-hidden="true">🕒</span>
          ¡Volvemos muy pronto!
        </p>
      </div>
    </div>
  );
}
