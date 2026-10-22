import { resolveImageSrc } from "@/lib/catalog";
import styles from "./PrizePhoto.module.css";

type PrizePhotoProps = {
  /** Ruta guardada en el torneo (/api/public/images/<id>) o null. */
  src: string | null;
  prize: string;
  size?: "md" | "sm";
};

/**
 * Foto del premio. Se ve ENTERA (sin recortes ni deformaciones) dentro de un
 * marco con el estilo Chocolate Intenso. Sin foto no se muestra nada: queda el
 * diseño de siempre.
 */
export function PrizePhoto({ src, prize, size = "md" }: PrizePhotoProps) {
  const url = resolveImageSrc(src);
  if (!url) return null;
  return (
    <figure className={`${styles.frame} ${size === "sm" ? styles.small : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto subida desde el panel, servida por la API */}
      <img src={url} alt={`Premio: ${prize}`} className={styles.image} loading="lazy" decoding="async" />
    </figure>
  );
}
