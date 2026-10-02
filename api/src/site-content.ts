/**
 * Textos públicos editables (Configuración → Textos del sitio).
 * Lógica pura (sin DB ni HTTP).
 *
 * Cada texto tiene una clave interna, un nombre visible para el admin, un
 * límite de caracteres y el texto ORIGINAL de la web. Sin fila en la base, la
 * web muestra el original (la web tiene su propia copia de estos valores en
 * src/lib/site-content.ts: mantener ambas listas iguales).
 */

export type SiteTextKind = "title" | "button" | "short" | "description";

export type SiteTextDefinition = {
  key: string;
  section: string;
  label: string;
  /** Ayuda opcional debajo del campo. */
  description?: string;
  kind: SiteTextKind;
  /** Solo el título del inicio admite renglones (cada renglón es una línea en la web). */
  multiline?: boolean;
  /** Límite propio cuando el general del tipo es demasiado largo para ese lugar. */
  max?: number;
  defaultValue: string;
};

/** Límites por tipo para no romper el diseño. */
export const SITE_TEXT_LIMITS: Record<SiteTextKind, number> = { title: 80, button: 30, short: 120, description: 250 };

export const SITE_TEXT_SECTIONS = [
  { id: "entry", label: "Cookie de entrada", description: "La cookie que aparece al abrir la web. Cada mordida muestra un texto distinto." },
  { id: "home", label: "Inicio", description: "La primera pantalla de la web." },
  { id: "homeCookie", label: "Cookie del inicio", description: "La cookie grande del inicio, que también se puede morder." },
  { id: "flavors", label: "Sabores", description: "La sección con las cookies del catálogo." },
  { id: "box", label: "Armá tu caja (en el inicio)", description: "El bloque con la foto de la caja." },
  { id: "final", label: "Cierre del inicio", description: "La invitación final, antes del pie de página." },
  { id: "builder", label: "Página “Armá tu caja”", description: "El encabezado de la página donde se arma el pedido." },
] as const;

export const SITE_TEXTS: readonly SiteTextDefinition[] = [
  // Cookie de entrada
  { key: "ENTRY_INITIAL", section: "entry", label: "Texto inicial", kind: "short", max: 60, defaultValue: "Probala para entrar." },
  { key: "ENTRY_BITE_ONE", section: "entry", label: "Después de la 1.ª mordida", kind: "short", max: 60, defaultValue: "Mmm..." },
  { key: "ENTRY_BITE_TWO", section: "entry", label: "Después de la 2.ª mordida", kind: "short", max: 60, defaultValue: "Una más." },
  { key: "ENTRY_ALMOST_DONE", section: "entry", label: "Después de la 3.ª mordida", kind: "short", max: 60, defaultValue: "Ya casi." },
  { key: "ENTRY_FINAL", section: "entry", label: "Al terminar la cookie", kind: "short", max: 60, defaultValue: "Bueno... ahora sí." },

  // Inicio
  { key: "HOME_EYEBROW", section: "home", label: "Etiqueta superior", description: "Se muestra en mayúsculas, arriba del título.", kind: "short", max: 40, defaultValue: "Cookies artesanales" },
  {
    key: "HOME_TITLE",
    section: "home",
    label: "Título principal",
    description: "Cada renglón se ve en una línea aparte (Enter para cortar).",
    kind: "title",
    multiline: true,
    defaultValue: "Cookies hechas\npara darte un gusto.",
  },
  { key: "HOME_DESCRIPTION", section: "home", label: "Descripción", kind: "description", defaultValue: "Cookies artesanales, combinaciones únicas y mucho sabor." },
  { key: "HOME_PRIMARY_CTA", section: "home", label: "Botón principal", description: "Lleva a los sabores.", kind: "button", defaultValue: "Ver sabores" },
  { key: "HOME_SECONDARY_CTA", section: "home", label: "Botón secundario", description: "Lleva a “Armá tu caja”.", kind: "button", defaultValue: "Armá tu caja" },

  // Cookie del inicio
  { key: "HOME_COOKIE_LABEL", section: "homeCookie", label: "Texto de la cookie", description: "Antes de la primera mordida.", kind: "short", max: 60, defaultValue: "Tocá la cookie" },
  { key: "HOME_COOKIE_BITE_ONE", section: "homeCookie", label: "Después de la 1.ª mordida", kind: "short", max: 60, defaultValue: "Mmm..." },
  { key: "HOME_COOKIE_BITE_TWO", section: "homeCookie", label: "Después de la 2.ª mordida", kind: "short", max: 60, defaultValue: "Una más." },
  { key: "HOME_COOKIE_BITE_THREE", section: "homeCookie", label: "Después de la 3.ª mordida", kind: "short", max: 60, defaultValue: "Ya casi." },
  { key: "HOME_COOKIE_FINAL", section: "homeCookie", label: "Al terminar la cookie", kind: "short", max: 60, defaultValue: "Bueno... no quedó nada." },
  { key: "HOME_COOKIE_RESET", section: "homeCookie", label: "Botón para otra cookie", kind: "button", defaultValue: "¿Otra?" },

  // Sabores
  { key: "FLAVORS_TITLE", section: "flavors", label: "Título", kind: "title", defaultValue: "Nuestros sabores" },
  { key: "FLAVORS_DESCRIPTION", section: "flavors", label: "Texto", kind: "description", defaultValue: "Elegí tu favorita. O probalas todas." },
  {
    key: "FLAVORS_EMPTY",
    section: "flavors",
    label: "Mensaje cuando no hay sabores",
    description: "Se ve solo si todavía no hay cookies publicadas.",
    kind: "short",
    defaultValue: "Estamos horneando: muy pronto vas a ver nuestros sabores acá.",
  },

  // Armá tu caja (inicio)
  { key: "BOX_TITLE", section: "box", label: "Título", kind: "title", defaultValue: "Armá tu caja" },
  { key: "BOX_DESCRIPTION", section: "box", label: "Descripción", kind: "description", defaultValue: "Elegí tus cookies favoritas y creá tu combinación." },
  { key: "BOX_CTA", section: "box", label: "Botón", kind: "button", defaultValue: "Empezar" },

  // Cierre
  { key: "FINAL_CTA_TITLE", section: "final", label: "Título", kind: "title", defaultValue: "¿Ya elegiste tus favoritas?" },
  { key: "FINAL_CTA_BUTTON", section: "final", label: "Botón", kind: "button", defaultValue: "Armá tu caja" },

  // Página Armá tu caja
  { key: "BUILDER_EYEBROW", section: "builder", label: "Etiqueta superior", description: "Se muestra en mayúsculas, arriba del título.", kind: "short", max: 40, defaultValue: "Armá tu caja" },
  { key: "BUILDER_TITLE", section: "builder", label: "Título", kind: "title", defaultValue: "Creá tu combinación perfecta." },
  { key: "BUILDER_DESCRIPTION", section: "builder", label: "Descripción", kind: "description", defaultValue: "Elegí tus cookies favoritas y armá tu pedido." },
];

const BY_KEY = new Map(SITE_TEXTS.map((t) => [t.key, t]));

export const siteTextDefinition = (key: string) => BY_KEY.get(key);

export const siteTextMax = (t: SiteTextDefinition) => t.max ?? SITE_TEXT_LIMITS[t.kind];

/** Máximo de renglones del título multilínea. */
const MAX_LINES = 3;

/** Espacios prolijos; los renglones solo se conservan donde el campo los admite. */
export function normalizeSiteText(t: SiteTextDefinition, raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return t.multiline ? lines.join("\n") : lines.join(" ");
}

/** null = volver al texto original (se borra la fila). */
export type SiteTextChange = { key: string; value: string | null };

export type SiteTextsValidation = { ok: true; data: SiteTextChange[] } | { ok: false; errors: Record<string, string> };

/**
 * Body del admin: { texts: { HOME_TITLE: "…", … } }. Puede venir solo una parte.
 * Vacío (o igual al original) = se vuelve al texto original.
 */
export function validateSiteTextsInput(input: unknown): SiteTextsValidation {
  const texts = typeof input === "object" && input !== null ? (input as Record<string, unknown>).texts : undefined;
  if (typeof texts !== "object" || texts === null || Array.isArray(texts)) return { ok: false, errors: { texts: "Formato inválido." } };

  const errors: Record<string, string> = {};
  const data: SiteTextChange[] = [];
  for (const [key, raw] of Object.entries(texts)) {
    const def = BY_KEY.get(key);
    if (!def) {
      errors[key] = "Texto desconocido.";
      continue;
    }
    if (raw !== null && typeof raw !== "string") {
      errors[key] = "Tiene que ser texto.";
      continue;
    }
    const value = raw === null ? "" : normalizeSiteText(def, raw);
    const max = siteTextMax(def);
    if (value.length > max) errors[key] = `Máximo ${max} caracteres.`;
    else if (def.multiline && value.split("\n").length > MAX_LINES) errors[key] = `Máximo ${MAX_LINES} renglones.`;
    else data.push({ key, value: value && value !== def.defaultValue ? value : null });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

export type SiteTextRow = { key: string; value: string; updatedAt: Date };

/** Lo que lee la web: solo los textos cambiados (el resto lo completa la web con el original). */
export function toPublicSiteTexts(rows: SiteTextRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => BY_KEY.has(r.key)).map((r) => [r.key, r.value]));
}

/** Lo que ve el panel: todos los textos agrupados, con su valor actual y el original. */
export function toAdminSiteTexts(rows: SiteTextRow[]) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const updated = rows.filter((r) => BY_KEY.has(r.key)).map((r) => r.updatedAt.getTime());
  return {
    updatedAt: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
    sections: SITE_TEXT_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      description: section.description,
      fields: SITE_TEXTS.filter((t) => t.section === section.id).map((t) => ({
        key: t.key,
        label: t.label,
        description: t.description ?? null,
        kind: t.kind,
        multiline: Boolean(t.multiline),
        maxLength: siteTextMax(t),
        defaultValue: t.defaultValue,
        value: byKey.get(t.key)?.value ?? null,
      })),
    })),
  };
}
