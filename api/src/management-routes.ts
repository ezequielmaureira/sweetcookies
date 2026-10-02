import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ManagementRepository, Result } from "./management-repository.ts";
import { validateIngredientInput, validatePriceInput, validateRecipeInput, validateSimulationInput } from "./management.ts";

type Variables = { userId: string };
type AppContext = Context<{ Variables: Variables }>;

type Deps = { management: ManagementRepository; log: (message: string) => void };

const ID = /^[a-z0-9]{10,40}$/;
const notFound = (c: Context) => c.json({ error: "not_found" }, 404);
const tooLarge = (c: Context) => c.json({ error: "payload_too_large" }, 413);

async function readJson(c: Context): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

const fail = (c: Context, r: Exclude<Result<unknown>, { ok: true }>) =>
  c.json({ error: r.error, ...(r.fields ? { fields: r.fields } : {}), ...(r.recipeCount !== undefined ? { recipeCount: r.recipeCount } : {}) }, r.status);

const query = (c: Context) => (c.req.query("q") ?? "").trim().slice(0, 80) || undefined;

/**
 * Gestión de costos: ingredientes, historial de precios y recetas.
 * SOLO admin: se registra DESPUÉS del middleware de /api/admin/* (Clerk 401 +
 * ADMIN_EMAILS 403). No hay ninguna ruta pública.
 */
export function registerManagementRoutes(app: Hono<{ Variables: Variables }>, { management, log }: Deps) {
  /* ---------- Ingredientes ---------- */

  app.get("/api/admin/ingredients", async (c) => c.json({ ingredients: await management.listIngredients(query(c)) }));

  app.post("/api/admin/ingredients", bodyLimit({ maxSize: 4 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateIngredientInput(parsed.body, false);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const { name, baseUnit } = result.data;
    const created = await management.createIngredient({ name: name!, baseUnit: baseUnit! });
    log(`[admin] ingredient ${created.id} created by ${c.get("userId")}`);
    return c.json(await management.getIngredient(created.id), 201);
  });

  app.get("/api/admin/ingredients/:id", async (c) => {
    const id = c.req.param("id") ?? "";
    if (!ID.test(id)) return notFound(c);
    const ingredient = await management.getIngredient(id);
    return ingredient ? c.json(ingredient) : notFound(c);
  });

  app.patch("/api/admin/ingredients/:id", bodyLimit({ maxSize: 4 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const id = c.req.param("id") ?? "";
    if (!ID.test(id)) return notFound(c);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateIngredientInput(parsed.body, true);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const updated = await management.updateIngredient(id, result.data);
    if (!updated.ok) return fail(c, updated);
    log(`[admin] ingredient ${id} updated by ${c.get("userId")}`);
    return c.json(await management.getIngredient(id));
  });

  app.delete("/api/admin/ingredients/:id", async (c: AppContext) => {
    const id = c.req.param("id") ?? "";
    if (!ID.test(id)) return notFound(c);
    const deleted = await management.deleteIngredient(id);
    if (!deleted.ok) return fail(c, deleted);
    log(`[admin] ingredient ${id} deleted by ${c.get("userId")}`);
    return c.body(null, 204);
  });

  /* ---------- Precios (historial: nunca se sobrescribe) ---------- */

  app.post("/api/admin/ingredients/:id/prices", bodyLimit({ maxSize: 4 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const id = c.req.param("id") ?? "";
    if (!ID.test(id)) return notFound(c);
    const baseUnit = await management.getIngredientBaseUnit(id);
    if (!baseUnit) return notFound(c);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validatePriceInput(parsed.body, baseUnit);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    await management.addPrice(id, result.data);
    log(`[admin] ingredient ${id} price added by ${c.get("userId")}`);
    return c.json(await management.getIngredient(id), 201);
  });

  app.delete("/api/admin/ingredients/:id/prices/:priceId", async (c: AppContext) => {
    const id = c.req.param("id") ?? "";
    const priceId = c.req.param("priceId") ?? "";
    if (!ID.test(id) || !ID.test(priceId)) return notFound(c);
    if (!(await management.deletePrice(id, priceId))) return notFound(c);
    log(`[admin] ingredient ${id} price ${priceId} deleted by ${c.get("userId")}`);
    return c.json(await management.getIngredient(id));
  });

  /* ---------- Recetas (el costo se calcula siempre con los precios actuales) ---------- */

  app.get("/api/admin/recipes", async (c) => c.json({ recipes: await management.listRecipes(query(c)) }));

  app.post("/api/admin/recipes", bodyLimit({ maxSize: 64 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateRecipeInput(parsed.body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const created = await management.createRecipe(result.data);
    if (!created.ok) return fail(c, created);
    log(`[admin] recipe ${created.data.id} created by ${c.get("userId")}`);
    return c.json(await management.getRecipe(created.data.id), 201);
  });

  app.get("/api/admin/recipes/:id", async (c) => {
    const id = c.req.param("id") ?? "";
    if (!ID.test(id)) return notFound(c);
    const recipe = await management.getRecipe(id);
    return recipe ? c.json(recipe) : notFound(c);
  });

  // Guardado completo de la receta (nombre, rendimiento, ingredientes y gastos).
  app.put("/api/admin/recipes/:id", bodyLimit({ maxSize: 64 * 1024, onError: tooLarge }), async (c: AppContext) => {
    const id = c.req.param("id") ?? "";
    if (!ID.test(id)) return notFound(c);
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateRecipeInput(parsed.body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const updated = await management.updateRecipe(id, result.data);
    if (!updated.ok) return fail(c, updated);
    log(`[admin] recipe ${id} updated by ${c.get("userId")}`);
    return c.json(await management.getRecipe(id));
  });

  /* ---------- Simulador de producción (solo calcula: no guarda nada) ---------- */

  app.post("/api/admin/production/simulate", bodyLimit({ maxSize: 16 * 1024, onError: tooLarge }), async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return c.json({ error: "invalid_json" }, 400);
    const result = validateSimulationInput(parsed.body);
    if (!result.ok) return c.json({ error: "validation_error", fields: result.errors }, 422);
    const simulation = await management.simulate(result.data);
    return simulation.ok ? c.json(simulation.data) : fail(c, simulation);
  });

  app.delete("/api/admin/recipes/:id", async (c: AppContext) => {
    const id = c.req.param("id") ?? "";
    if (!ID.test(id)) return notFound(c);
    if (!(await management.deleteRecipe(id))) return notFound(c);
    log(`[admin] recipe ${id} deleted by ${c.get("userId")}`);
    return c.body(null, 204);
  });
}
