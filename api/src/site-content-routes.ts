import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ImageRepository } from "./image-repository.ts";
import type { SiteContentRepository } from "./site-content-repository.ts";
import { toAdminSiteTexts, toPublicSiteTexts, validateSiteTextsInput } from "./site-content.ts";
import { siteImageDefinition, toAdminSiteImages, toPublicSiteImages, uploadedImageId, validateSiteImageInput } from "./site-images.ts";

type Variables = { userId: string };
type AppContext = Context<{ Variables: Variables }>;

type Deps = {
  content: SiteContentRepository;
  /** Para comprobar que la foto elegida existe (se sube antes por /api/admin/images). */
  images: ImageRepository;
  log: (message: string) => void;
};

/**
 * Textos y fotos del sitio. Se registra DESPUÉS del middleware de /api/admin/*:
 * las rutas admin ya llegan autenticadas (401) y autorizadas por ADMIN_EMAILS (403).
 */
export function registerSiteContentRoutes(app: Hono<{ Variables: Variables }>, { content, images, log }: Deps) {
  // Público: solo los textos y fotos cambiados; la web completa el resto con los originales.
  app.get("/api/public/content", async (c) => {
    c.header("Cache-Control", "public, max-age=10, s-maxage=10, stale-while-revalidate=30");
    const rows = await content.list();
    return c.json({ texts: toPublicSiteTexts(rows), images: toPublicSiteImages(rows) });
  });

  app.get("/api/admin/content", async (c) => c.json(toAdminSiteTexts(await content.list())));

  app.put("/api/admin/content", bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) }), async (c: AppContext) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const result = validateSiteTextsInput(body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const rows = await content.save(result.data, c.get("userId"));
    log(`[admin] site texts updated by ${c.get("userId")}`);
    return c.json(toAdminSiteTexts(rows));
  });

  // Fotos del sitio (Configuración → Foto de “Armá tu box”).
  app.get("/api/admin/content/images", async (c) => c.json(toAdminSiteImages(await content.list())));

  app.put("/api/admin/content/images/:key", bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) }), async (c: AppContext) => {
    const key = c.req.param("key") ?? "";
    if (!siteImageDefinition(key)) return c.json({ error: "not_found" }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const result = validateSiteImageInput(body);
    if (!result.ok) return c.json({ error: "validation_error", fields: { url: result.error } }, 422);
    // Solo imágenes que existen de verdad (subidas antes desde el panel).
    if (result.url && !(await images.get(uploadedImageId(result.url) ?? ""))) {
      return c.json({ error: "validation_error", fields: { url: "La imagen no existe. Volvé a subirla." } }, 422);
    }
    const rows = await content.saveImage(key, result.url, c.get("userId"));
    log(`[admin] site image ${key} ${result.url ? "updated" : "reset"} by ${c.get("userId")}`);
    return c.json(toAdminSiteImages(rows));
  });
}
