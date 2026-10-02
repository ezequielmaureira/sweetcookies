/**
 * Ayuda visual de Configuración → Textos del sitio: una captura estática de cada
 * sección de la web (public/images/admin/textos) y dónde está cada texto, en % de
 * la imagen. Capturadas de producción a 1200 px de ancho; no hace falta precisión
 * milimétrica: solo indicar qué parte de la web corresponde a cada campo.
 */
export type GuideBox = { x: number; y: number; w: number; h: number };

export type SiteTextGuide = { image: string; width: number; height: number; alt: string; boxes: Record<string, GuideBox> };

export const SITE_TEXT_GUIDES: Record<string, SiteTextGuide> = {
  entry: {
    image: "/images/admin/textos/entrada.jpg",
    width: 1200,
    height: 860,
    alt: "Cookie de entrada de la web",
    boxes: {
      ENTRY_INITIAL: { x: 39.8, y: 82.7, w: 20.4, h: 6.2 },
      ENTRY_BITE_ONE: { x: 39.8, y: 82.7, w: 20.4, h: 6.2 },
      ENTRY_BITE_TWO: { x: 39.8, y: 82.7, w: 20.4, h: 6.2 },
      ENTRY_ALMOST_DONE: { x: 39.8, y: 82.7, w: 20.4, h: 6.2 },
      ENTRY_FINAL: { x: 39.8, y: 82.7, w: 20.4, h: 6.2 },
    },
  },
  home: {
    image: "/images/admin/textos/inicio.jpg",
    width: 1200,
    height: 707,
    alt: "Primera pantalla de la web",
    boxes: {
      HOME_EYEBROW: { x: 3.5, y: 18.8, w: 18.4, h: 4.4 },
      HOME_TITLE: { x: 3.5, y: 24.1, w: 43.4, h: 28.6 },
      HOME_DESCRIPTION: { x: 3.5, y: 53.9, w: 37.8, h: 10.3 },
      HOME_PRIMARY_CTA: { x: 3.5, y: 67, w: 12.6, h: 8.5 },
      HOME_SECONDARY_CTA: { x: 16.1, y: 67, w: 15.3, h: 8.5 },
    },
  },
  homeCookie: {
    image: "/images/admin/textos/inicio.jpg",
    width: 1200,
    height: 707,
    alt: "Primera pantalla de la web, con la cookie grande",
    boxes: {
      HOME_COOKIE_LABEL: { x: 67.7, y: 83.1, w: 14.8, h: 7.6 },
      HOME_COOKIE_BITE_ONE: { x: 67.7, y: 83.1, w: 14.8, h: 7.6 },
      HOME_COOKIE_BITE_TWO: { x: 67.7, y: 83.1, w: 14.8, h: 7.6 },
      HOME_COOKIE_BITE_THREE: { x: 67.7, y: 83.1, w: 14.8, h: 7.6 },
      HOME_COOKIE_FINAL: { x: 67.7, y: 83.1, w: 14.8, h: 7.6 },
      HOME_COOKIE_RESET: { x: 67.7, y: 83.1, w: 14.8, h: 7.6 },
    },
  },
  flavors: {
    image: "/images/admin/textos/sabores.jpg",
    width: 1200,
    height: 440,
    alt: "Sección de sabores",
    boxes: {
      FLAVORS_TITLE: { x: 3.5, y: 24.1, w: 41.1, h: 17.6 },
      FLAVORS_DESCRIPTION: { x: 73.2, y: 32.7, w: 23.3, h: 8.9 },
    },
  },
  box: {
    image: "/images/admin/textos/caja.jpg",
    width: 1200,
    height: 777,
    alt: "Bloque “Armá tu caja” del inicio",
    boxes: {
      BOX_TITLE: { x: 61.8, y: 34.6, w: 32.4, h: 11 },
      BOX_DESCRIPTION: { x: 61.8, y: 46.1, w: 31.8, h: 9 },
      BOX_CTA: { x: 61.8, y: 57.7, w: 12.9, h: 7.7 },
    },
  },
  final: {
    image: "/images/admin/textos/cierre.jpg",
    width: 1200,
    height: 495,
    alt: "Cierre del inicio",
    boxes: {
      FINAL_CTA_TITLE: { x: 25, y: 26.3, w: 49.9, h: 30.5 },
      FINAL_CTA_BUTTON: { x: 42.4, y: 60, w: 15.3, h: 12.1 },
    },
  },
  builder: {
    image: "/images/admin/textos/pagina-caja.jpg",
    width: 1200,
    height: 360,
    alt: "Encabezado de la página “Armá tu caja”",
    boxes: {
      BUILDER_EYEBROW: { x: 3.5, y: 11.6, w: 12.9, h: 8.7 },
      BUILDER_TITLE: { x: 3.5, y: 19.7, w: 55.1, h: 45.6 },
      BUILDER_DESCRIPTION: { x: 3.5, y: 64.7, w: 40, h: 11.8 },
    },
  },
};
