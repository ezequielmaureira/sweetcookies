import { site } from "@/data/site";
import { apiUrl, fetchWithTimeout } from "@/lib/api";
import { parsePublicSettings, type PublicSettings } from "@/lib/settings-parse";

export { instagramUrl, parsePublicSettings, type PublicSettings } from "@/lib/settings-parse";

/**
 * Configuración pública del sitio. Fuente autoritativa: Neon → SiteSettings,
 * servida por GET /api/public/settings (backend en Fly).
 */
export const PUBLIC_SETTINGS_PATH = "/api/public/settings";

/**
 * Respaldo si la API no responde: solo el Instagram conocido. El teléfono del
 * negocio no tiene respaldo en el código: sin API no se puede pedir (nunca un
 * número inventado ni hardcodeado).
 */
export const FALLBACK_SETTINGS: PublicSettings = {
  whatsappNumber: null,
  instagramHandle: site.instagram.handle,
  whatsappOrdersEnabled: true,
};

/** Tiempo de revalidación de las páginas que muestran settings (Footer). */
export const SETTINGS_REVALIDATE_SECONDS = 60;

/**
 * Lectura desde el servidor (Server Components). Se revalida cada 60 s, así
 * un cambio en el admin llega a la web sin redeploy.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  const url = apiUrl(PUBLIC_SETTINGS_PATH);
  if (!url) return FALLBACK_SETTINGS;
  try {
    const res = await fetchWithTimeout(url, { next: { revalidate: SETTINGS_REVALIDATE_SECONDS }, timeoutMs: 6000 });
    if (!res.ok) return FALLBACK_SETTINGS;
    return parsePublicSettings(await res.json()) ?? FALLBACK_SETTINGS;
  } catch {
    return FALLBACK_SETTINGS;
  }
}
