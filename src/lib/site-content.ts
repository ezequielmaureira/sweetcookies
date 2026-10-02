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
  HOME_SECONDARY_CTA: "Armá tu caja",
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
  // Armá tu caja (inicio)
  BOX_TITLE: "Armá tu caja",
  BOX_DESCRIPTION: "Elegí tus cookies favoritas y creá tu combinación.",
  BOX_CTA: "Empezar",
  // Cierre
  FINAL_CTA_TITLE: "¿Ya elegiste tus favoritas?",
  FINAL_CTA_BUTTON: "Armá tu caja",
  // Página Armá tu caja
  BUILDER_EYEBROW: "Armá tu caja",
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
