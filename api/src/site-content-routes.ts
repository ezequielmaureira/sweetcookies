import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { SiteContentRepository } from "./site-content-repository.ts";
import { toAdminSiteTexts, toPublicSiteTexts, validateSiteTextsInput } from "./site-content.ts";

type Variables = { userId: string };
type AppContext = Context<{ Variables: Variables }>;

type Deps = {
  content: SiteContentRepository;
  log: (message: string) => void;
};

/**
 * Textos del sitio. Se registra DESPUÉS del middleware de /api/admin/*: las
 * rutas admin ya llegan autenticadas (401) y autorizadas por ADMIN_EMAILS (403).
 */
export function registerSiteContentRoutes(app: Hono<{ Variables: Variables }>, { content, log }: Deps) {
  // Público: solo los textos cambiados; la web completa el resto con los originales.
  app.get("/api/public/content", async (c) => {
    c.header("Cache-Control", "public, max-age=10, s-maxage=10, stale-while-revalidate=30");
    return c.json({ texts: toPublicSiteTexts(await content.list()) });
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
}
