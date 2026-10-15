import { apiUrl, fetchWithTimeout } from "@/lib/api";
import { PUBLIC_CONTENT_PATH, SITE_TEXT_DEFAULTS, parseSiteImages, parseSiteTexts, type SiteImages, type SiteTexts } from "@/lib/site-content";

/** Mismo ritmo que el catálogo: un cambio del admin se ve en la web en segundos, sin redeploy. */
export const SITE_CONTENT_REVALIDATE_SECONDS = 15;

/** Textos y fotos del sitio desde el servidor. Si la API no responde: los originales. */
export async function getSiteContent(): Promise<{ texts: SiteTexts; images: SiteImages }> {
  const fallback = { texts: { ...SITE_TEXT_DEFAULTS }, images: {} };
  const url = apiUrl(PUBLIC_CONTENT_PATH);
  if (!url) return fallback;
  try {
    const res = await fetchWithTimeout(url, { next: { revalidate: SITE_CONTENT_REVALIDATE_SECONDS }, timeoutMs: 6000 });
    if (!res.ok) return fallback;
    const json: unknown = await res.json();
    return { texts: parseSiteTexts(json), images: parseSiteImages(json) };
  } catch {
    return fallback;
  }
}

/** Textos del sitio desde el servidor. Si la API no responde: los textos originales. */
export async function getSiteTexts(): Promise<SiteTexts> {
  return (await getSiteContent()).texts;
}
