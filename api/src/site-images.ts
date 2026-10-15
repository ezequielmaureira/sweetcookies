/**
 * Fotos del sitio editables desde el panel (Configuración → Foto de “Armá tu box”).
 * Lógica pura (sin DB ni HTTP).
 *
 * La foto se sube con el mismo sistema que las de producto (POST /api/admin/images,
 * tabla product_images) y acá solo se guarda su ruta, en la misma tabla que los
 * textos del sitio (site_content), con una clave propia. Sin fila, la web usa la
 * foto original del sitio (public/images/cookies/).
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

/** null = volver a la foto original (se borra la fila). */
export type SiteImageValidation = { ok: true; url: string | null } | { ok: false; error: string };

/** Body del admin: { url: "/api/public/images/<id>" } o { url: null }. */
export function validateSiteImageInput(input: unknown): SiteImageValidation {
  if (typeof input !== "object" || input === null || !("url" in input)) return { ok: false, error: "Formato inválido." };
  const url = (input as { url: unknown }).url;
  if (url === null) return { ok: true, url: null };
  if (typeof url !== "string" || !uploadedImageId(url)) return { ok: false, error: "Imagen inválida." };
  return { ok: true, url };
}

export type SiteImageRow = { key: string; value: string; updatedAt: Date };

/** Lo que lee la web: solo las fotos cambiadas (el resto usa la original). */
export function toPublicSiteImages(rows: SiteImageRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => BY_KEY.has(r.key) && uploadedImageId(r.value)).map((r) => [r.key, r.value]));
}

/** Lo que ve el panel: cada foto editable con su valor actual (null = la original). */
export function toAdminSiteImages(rows: SiteImageRow[]) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return {
    images: SITE_IMAGES.map((i) => {
      const row = byKey.get(i.key);
      return { key: i.key, label: i.label, description: i.description, url: row?.value ?? null, updatedAt: row?.updatedAt.toISOString() ?? null };
    }),
  };
}
