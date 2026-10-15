/**
 * Fotos del sitio editables desde el panel (Configuración → Foto de “Armá tu box”).
 * Lógica pura (sin DB ni HTTP).
 *
 * La foto se sube con el mismo sistema que las de producto (POST /api/admin/images,
 * tabla product_images) y acá solo se guarda su ruta, en la misma tabla que los
 * textos del sitio (site_content), con una clave propia. Sin fila, la web usa la
 * foto original del sitio (public/images/cookies/).
 *
 * El encuadre (zoom y punto central, uno para celular y otro para computadora,
 * porque el recuadro cambia de proporción) se guarda en otra fila,
 * "<clave>_FRAMING", como JSON. Vale para la foto subida o para la original.
 */

export type SiteImageDefinition = { key: string; section: string; label: string; description: string };

export const SITE_IMAGES: readonly SiteImageDefinition[] = [
  { key: "BOX_IMAGE", section: "box", label: "Foto de “Armá tu box”", description: "La foto del bloque “Armá tu box” del inicio." },
];

const BY_KEY = new Map(SITE_IMAGES.map((i) => [i.key, i]));

export const siteImageDefinition = (key: string) => BY_KEY.get(key);

/** Solo imágenes subidas desde el panel (nunca URLs externas). */
const UPLOADED = /^\/api\/public\/images\/([a-z0-9]{10,40})$/;

/** Id de la imagen subida a partir de su ruta, o null si no es una ruta válida. */
export const uploadedImageId = (url: string) => UPLOADED.exec(url)?.[1] ?? null;

/* ---------- Encuadre ---------- */

/** Zoom 1–4 (nunca menos: la foto siempre cubre el recuadro, sin espacios vacíos) y punto central 0–100 %. */
export type Framing = { scale: number; x: number; y: number };
export type SiteImageFraming = { mobile: Framing; desktop: Framing };

export const FRAMING_LIMITS = { minScale: 1, maxScale: 4 } as const;
export const DEFAULT_FRAMING: Framing = { scale: 1, x: 50, y: 50 };

export const framingKey = (key: string) => `${key}_FRAMING`;

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseFraming(raw: unknown): Framing | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { scale, x, y } = raw as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? round2(v) : null);
  const s = num(scale, FRAMING_LIMITS.minScale, FRAMING_LIMITS.maxScale);
  const px = num(x, 0, 100);
  const py = num(y, 0, 100);
  return s === null || px === null || py === null ? null : { scale: s, x: px, y: py };
}

/** { mobile, desktop } válidos, o null si falta algo o está fuera de rango. */
export function parseSiteImageFraming(raw: unknown): SiteImageFraming | null {
  if (typeof raw !== "object" || raw === null) return null;
  const mobile = parseFraming((raw as Record<string, unknown>).mobile);
  const desktop = parseFraming((raw as Record<string, unknown>).desktop);
  return mobile && desktop ? { mobile, desktop } : null;
}

const isDefault = (f: SiteImageFraming) =>
  [f.mobile, f.desktop].every((p) => p.scale === DEFAULT_FRAMING.scale && p.x === DEFAULT_FRAMING.x && p.y === DEFAULT_FRAMING.y);

/** Lee la fila guardada (JSON). Datos rotos → null (se usa el encuadre centrado). */
function readFraming(value: string | undefined): SiteImageFraming | null {
  if (!value) return null;
  try {
    return parseSiteImageFraming(JSON.parse(value));
  } catch {
    return null;
  }
}

/** url null = volver a la foto original. framing null = encuadre centrado (en ambos casos se borra la fila). */
export type SiteImageValidation = { ok: true; url: string | null; framing: SiteImageFraming | null } | { ok: false; error: string };

/** Body del admin: { url: "/api/public/images/<id>" | null, framing?: { mobile, desktop } | null }. */
export function validateSiteImageInput(input: unknown): SiteImageValidation {
  if (typeof input !== "object" || input === null || !("url" in input)) return { ok: false, error: "Formato inválido." };
  const { url, framing: rawFraming } = input as { url: unknown; framing?: unknown };
  if (url !== null && (typeof url !== "string" || !uploadedImageId(url))) return { ok: false, error: "Imagen inválida." };
  let framing: SiteImageFraming | null = null;
  if (rawFraming !== undefined && rawFraming !== null) {
    framing = parseSiteImageFraming(rawFraming);
    if (!framing) return { ok: false, error: "Encuadre inválido." };
    if (isDefault(framing)) framing = null;
  }
  return { ok: true, url: url as string | null, framing };
}

export type SiteImageRow = { key: string; value: string; updatedAt: Date };

/** Lo que lee la web: solo las fotos cambiadas (el resto usa la original). */
export function toPublicSiteImages(rows: SiteImageRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => BY_KEY.has(r.key) && uploadedImageId(r.value)).map((r) => [r.key, r.value]));
}

/** Encuadres guardados (solo los que no son el centrado por defecto). */
export function toPublicSiteImageFramings(rows: SiteImageRow[]): Record<string, SiteImageFraming> {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, SiteImageFraming> = {};
  for (const { key } of SITE_IMAGES) {
    const framing = readFraming(byKey.get(framingKey(key)));
    if (framing) out[key] = framing;
  }
  return out;
}

/** Lo que ve el panel: cada foto editable con su valor actual (null = la original). */
export function toAdminSiteImages(rows: SiteImageRow[]) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return {
    images: SITE_IMAGES.map((i) => {
      const row = byKey.get(i.key);
      const framingRow = byKey.get(framingKey(i.key));
      const dates = [row?.updatedAt, framingRow?.updatedAt].filter((d): d is Date => Boolean(d)).map((d) => d.getTime());
      return {
        key: i.key,
        label: i.label,
        description: i.description,
        url: row?.value ?? null,
        framing: readFraming(framingRow?.value) ?? { mobile: DEFAULT_FRAMING, desktop: DEFAULT_FRAMING },
        updatedAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
      };
    }),
  };
}
