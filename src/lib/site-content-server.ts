import { apiUrl, fetchWithTimeout } from "@/lib/api";
import { PUBLIC_CONTENT_PATH, SITE_TEXT_DEFAULTS, parseSiteTexts, type SiteTexts } from "@/lib/site-content";

/** Mismo ritmo que el catálogo: un cambio del admin se ve en la web en segundos, sin redeploy. */
export const SITE_CONTENT_REVALIDATE_SECONDS = 15;

/** Textos del sitio desde el servidor. Si la API no responde: los textos originales. */
export async function getSiteTexts(): Promise<SiteTexts> {
  const url = apiUrl(PUBLIC_CONTENT_PATH);
  if (!url) return { ...SITE_TEXT_DEFAULTS };
  try {
    const res = await fetchWithTimeout(url, { next: { revalidate: SITE_CONTENT_REVALIDATE_SECONDS }, timeoutMs: 6000 });
    return res.ok ? parseSiteTexts(await res.json()) : { ...SITE_TEXT_DEFAULTS };
  } catch {
    return { ...SITE_TEXT_DEFAULTS };
  }
}
