/**
 * Imágenes de marca (en /public/images/cookies/, se aceptan varias extensiones:
 * ver src/lib/images.ts).
 *
 * El catálogo de sabores NO vive acá: está en PostgreSQL (tabla products) y se
 * administra desde /admin/productos. La web lo lee de GET /api/public/products.
 */
export const brandImages = {
  /** Cookie del hero, recortada sin fondo (PNG). Ideal para la interacción de mordisco. */
  heroCutout: "hero-cookie-cutout",
  /** Foto cenital de una cookie para el hero (respaldo si no hay recorte). */
  hero: "hero-cookie",
  box: "box-cookies",
  logo: "logo-sweet-cookies",
} as const;
