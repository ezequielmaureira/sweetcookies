import { brandImages, flavors } from "@/data/cookies";
import { resolveFirstImage, resolveImage } from "@/lib/images";

/**
 * Foto REAL de la cookie (entrada al sitio y Hero), solo servidor.
 * Orden: recorte sin fondo → foto cenital → primera foto de sabor disponible.
 */
export function getHeroCookie() {
  const cutout = resolveImage(brandImages.heroCutout);
  const src = cutout ?? resolveFirstImage([brandImages.hero, ...flavors.map((f) => f.image)]);
  const flavor = flavors.find((f) => src?.includes(`/${f.image}.`));
  return {
    src,
    isCutout: Boolean(cutout),
    alt: flavor?.alt ?? "Cookie artesanal de Sweet Cookies",
  };
}
