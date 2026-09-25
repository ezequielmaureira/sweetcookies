import { brandImages } from "@/data/cookies";
import { resolveImage } from "@/lib/images";

/**
 * Foto REAL de la cookie (entrada al sitio y Hero), solo servidor.
 * Orden: recorte sin fondo → foto cenital. Es un asset de marca, no un producto.
 */
export function getHeroCookie() {
  const cutout = resolveImage(brandImages.heroCutout);
  return {
    src: cutout ?? resolveImage(brandImages.hero),
    isCutout: Boolean(cutout),
    alt: "Cookie artesanal de Sweet Cookies",
  };
}
