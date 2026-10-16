/**
 * Textos públicos editables desde el panel (Configuración → Textos del sitio).
 *
 * La web muestra: el texto guardado en la base → si no hay, el ORIGINAL de acá.
 * Así nunca queda un título vacío, aunque la API no responda.
 * Estos originales tienen que coincidir con los de api/src/site-content.ts.
 */
export const SITE_TEXT_DEFAULTS = {
  // Cookie de entrada
  ENTRY_INITIAL: "Probala para entrar.",
  ENTRY_BITE_ONE: "Mmm...",
  ENTRY_BITE_TWO: "Una más.",
  ENTRY_ALMOST_DONE: "Ya casi.",
  ENTRY_FINAL: "Bueno... ahora sí.",
  // Inicio
  HOME_EYEBROW: "Cookies artesanales",
  HOME_TITLE: "Cookies hechas\npara darte un gusto.",
  HOME_DESCRIPTION: "Cookies artesanales, combinaciones únicas y mucho sabor.",
  HOME_PRIMARY_CTA: "Ver sabores",
  HOME_SECONDARY_CTA: "Armá tu box",
  // Cookie del inicio
  HOME_COOKIE_LABEL: "Tocá la cookie",
  HOME_COOKIE_BITE_ONE: "Mmm...",
  HOME_COOKIE_BITE_TWO: "Una más.",
  HOME_COOKIE_BITE_THREE: "Ya casi.",
  HOME_COOKIE_FINAL: "Bueno... no quedó nada.",
  HOME_COOKIE_RESET: "¿Otra?",
  // Sabores
  FLAVORS_TITLE: "Nuestros sabores",
  FLAVORS_DESCRIPTION: "Elegí tu favorita. O probalas todas.",
  FLAVORS_EMPTY: "Estamos horneando: muy pronto vas a ver nuestros sabores acá.",
  // Armá tu box (inicio)
  BOX_TITLE: "Armá tu box",
  BOX_DESCRIPTION: "Elegí tus cookies favoritas y creá tu combinación.",
  BOX_CTA: "Empezar",
  // Cierre
  FINAL_CTA_TITLE: "¿Ya elegiste tus favoritas?",
  FINAL_CTA_BUTTON: "Armá tu box",
  // Página Armá tu box
  BUILDER_EYEBROW: "Armá tu box",
  BUILDER_TITLE: "Creá tu combinación perfecta.",
  BUILDER_DESCRIPTION: "Elegí tus cookies favoritas y armá tu pedido.",
} as const;

export type SiteTextKey = keyof typeof SITE_TEXT_DEFAULTS;
export type SiteTexts = Record<SiteTextKey, string>;

export const PUBLIC_CONTENT_PATH = "/api/public/content";

/** Une lo que vino de la API con los originales (ignora claves desconocidas o vacías). */
export function parseSiteTexts(json: unknown): SiteTexts {
  const texts: SiteTexts = { ...SITE_TEXT_DEFAULTS };
  const raw = typeof json === "object" && json !== null ? (json as Record<string, unknown>).texts : null;
  if (typeof raw !== "object" || raw === null) return texts;
  for (const key of Object.keys(SITE_TEXT_DEFAULTS) as SiteTextKey[]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim() && value.length <= 400) texts[key] = value;
  }
  return texts;
}

/** Renglones de un texto (el título del inicio va en líneas separadas). */
export const textLines = (text: string) => text.split("\n").filter((line) => line.trim());

/**
 * Fotos del sitio cambiadas desde el panel (Configuración → Foto de “Armá tu box”).
 * Sin valor, la web usa la foto original de public/images/cookies/.
 */
export type SiteImageKey = "BOX_IMAGE";
export type SiteImages = Partial<Record<SiteImageKey, string>>;

const SITE_IMAGE_KEYS: readonly SiteImageKey[] = ["BOX_IMAGE"];

/** Solo rutas de imágenes subidas desde el panel (se sirven desde la API). */
const UPLOADED_IMAGE = /^\/api\/public\/images\/[a-z0-9]{10,40}$/;

/**
 * Encuadre de una foto del sitio. El recuadro y la foto son independientes:
 * - scale: tamaño respecto de la foto ENTERA dentro del recuadro (1 = completa;
 *   0,2–1 más chica, con el fondo del sitio alrededor; hasta 3 más grande).
 * - x, y: dónde queda el centro de la foto, en % del recuadro (50/50 = centrada; −50 a 150).
 */
export type ImageFraming = { scale: number; x: number; y: number };

export const IMAGE_FRAMING_LIMITS = { minScale: 0.2, maxScale: 3, minPosition: -50, maxPosition: 150 } as const;

/** Transformación de la foto (con object-fit: contain) para un encuadre: la usan la web y la vista previa del panel. */
export const imageFramingTransform = ({ scale, x, y }: ImageFraming) => `translate(${x - 50}%, ${y - 50}%) scale(${scale})`;
/** Celular/tablet (< 1024 px) y computadora (≥ 1024 px). */
export type ResponsiveFraming = { mobile: ImageFraming; desktop: ImageFraming };
export type SiteImageFramings = Partial<Record<SiteImageKey, ResponsiveFraming>>;

export const DEFAULT_IMAGE_FRAMING: ImageFraming = { scale: 1, x: 50, y: 50 };

function parseFraming(raw: unknown): ImageFraming | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { scale, x, y } = raw as Record<string, unknown>;
  const ok = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const L = IMAGE_FRAMING_LIMITS;
  return ok(scale, L.minScale, L.maxScale) && ok(x, L.minPosition, L.maxPosition) && ok(y, L.minPosition, L.maxPosition) ? { scale, x, y } : null;
}

/** Encuadres que vinieron de la API (los inválidos se ignoran: queda centrada, como siempre). */
export function parseSiteImageFramings(json: unknown): SiteImageFramings {
  const framings: SiteImageFramings = {};
  const raw = typeof json === "object" && json !== null ? (json as Record<string, unknown>).framings : null;
  if (typeof raw !== "object" || raw === null) return framings;
  for (const key of SITE_IMAGE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "object" || value === null) continue;
    const mobile = parseFraming((value as Record<string, unknown>).mobile);
    const desktop = parseFraming((value as Record<string, unknown>).desktop);
    if (mobile && desktop) framings[key] = { mobile, desktop };
  }
  return framings;
}

/** Fotos que vinieron de la API (ignora claves desconocidas o rutas inválidas). */
export function parseSiteImages(json: unknown): SiteImages {
  const images: SiteImages = {};
  const raw = typeof json === "object" && json !== null ? (json as Record<string, unknown>).images : null;
  if (typeof raw !== "object" || raw === null) return images;
  for (const key of SITE_IMAGE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && UPLOADED_IMAGE.test(value)) images[key] = value;
  }
  return images;
}
