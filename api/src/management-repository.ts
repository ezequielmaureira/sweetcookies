import type { PrismaClient } from "./generated/prisma/client.ts";
import {
  computeRecipe,
  dimensionOf,
  simulateProduction,
  toIngredientJson,
  toPriceJson,
  type IngredientInput,
  type IngredientRow,
  type PriceData,
  type RecipeInput,
  type RecipeRow,
  type SimulationItem,
} from "./management.ts";

type Fail = { ok: false; status: 404 | 409 | 422; error: string; fields?: Record<string, string>; recipeCount?: number };
type Ok<T> = { ok: true; data: T };
export type Result<T> = Ok<T> | Fail;

const notFound: Fail = { ok: false, status: 404, error: "not_found" };

/** Compra más reciente = costo actual (fecha de compra; a igual fecha, la última cargada). */
const latestPrice = { orderBy: [{ purchasedAt: "desc" as const }, { createdAt: "desc" as const }], take: 1 };

const ingredientInclude = { prices: latestPrice, _count: { select: { recipeLines: true, prices: true } } };

type IngredientWithLatest = Omit<IngredientRow, "currentPrice" | "recipeCount" | "priceCount"> & {
  prices: NonNullable<IngredientRow["currentPrice"]>[];
  _count: { recipeLines: number; prices: number };
};

const toRow = (i: IngredientWithLatest): IngredientRow => ({
  id: i.id,
  name: i.name,
  baseUnit: i.baseUnit,
  active: i.active,
  gramsPerUnit: i.gramsPerUnit,
  mlPerUnit: i.mlPerUnit,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
  currentPrice: i.prices[0] ?? null,
  recipeCount: i._count.recipeLines,
  priceCount: i._count.prices,
});

const recipeInclude = {
  ingredients: { orderBy: { position: "asc" as const }, include: { ingredient: { include: { prices: latestPrice } } } },
  extraCosts: { orderBy: { position: "asc" as const } },
};

type RecipeWithRelations = {
  id: string;
  name: string;
  yieldQuantity: number | null;
  status: RecipeRow["status"];
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  ingredients: { id: string; quantity: RecipeRow["lines"][number]["quantity"]; unit: RecipeRow["lines"][number]["unit"]; component: RecipeRow["lines"][number]["component"]; ingredient: {
      id: string;
      name: string;
      baseUnit: IngredientRow["baseUnit"];
      active: boolean;
      gramsPerUnit: IngredientRow["gramsPerUnit"];
      mlPerUnit: IngredientRow["mlPerUnit"];
      prices: { unitCost: RecipeRow["lines"][number]["quantity"]; purchaseUnit: RecipeRow["lines"][number]["unit"] }[];
    };
  }[];
  extraCosts: RecipeRow["extras"];
};

const toRecipeRow = (r: RecipeWithRelations): RecipeRow => ({
    ...r,
    lines: r.ingredients.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      unit: l.unit,
      component: l.component,
      ingredient: {
        id: l.ingredient.id,
        name: l.ingredient.name,
        baseUnit: l.ingredient.baseUnit,
        active: l.ingredient.active,
        gramsPerUnit: l.ingredient.gramsPerUnit,
        mlPerUnit: l.ingredient.mlPerUnit,
        // Precio vigente en la dimensión en que se compró (g / ml / unidad).
        price: l.ingredient.prices[0] ? { unitCost: l.ingredient.prices[0].unitCost, dimension: dimensionOf(l.ingredient.prices[0].purchaseUnit) } : null,
      },
    })),
    extras: r.extraCosts,
  });

const recipeJson = (r: RecipeWithRelations) => computeRecipe(toRecipeRow(r));

const search = (q?: string) => (q ? { name: { contains: q, mode: "insensitive" as const } } : {});

export function createManagementRepository(prisma: PrismaClient) {
  const getIngredientRow = async (id: string) => {
    const row = await prisma.ingredient.findUnique({ where: { id }, include: ingredientInclude });
    return row ? toRow(row) : null;
  };

  /** Valida las líneas contra los ingredientes reales (existencia, activo). Cualquier unidad sirve: la conversión la resuelve el costo. */
  async function checkLines(input: RecipeInput, allowInactive: Set<string>): Promise<Record<string, string>> {
    const ids = [...new Set(input.lines.map((l) => l.ingredientId))];
    const found = new Map((await prisma.ingredient.findMany({ where: { id: { in: ids } }, select: { id: true, active: true } })).map((i) => [i.id, i]));
    const errors: Record<string, string> = {};
    input.lines.forEach((line, i) => {
      const ingredient = found.get(line.ingredientId);
      if (!ingredient) errors[`ingredients.${i}.ingredientId`] = "Ese ingrediente ya no existe.";
      else if (!ingredient.active && !allowInactive.has(ingredient.id)) errors[`ingredients.${i}.ingredientId`] = "Ese ingrediente está inactivo.";
    });
    return errors;
  }

  const lineRows = (recipeId: string, input: RecipeInput) => ({
    lines: input.lines.map((l, position) => ({ recipeId, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, component: l.component, position })),
    extras: input.extras.map((e, position) => ({ recipeId, name: e.name, amount: e.amount, position })),
  });

  return {
    /* ---------- Ingredientes ---------- */

    async listIngredients(q?: string) {
      const rows = await prisma.ingredient.findMany({ where: search(q), include: ingredientInclude, orderBy: [{ active: "desc" }, { name: "asc" }] });
      return rows.map((r) => toIngredientJson(toRow(r)));
    },

    async getIngredient(id: string) {
      const row = await getIngredientRow(id);
      if (!row) return null;
      const prices = await prisma.ingredientPrice.findMany({ where: { ingredientId: id }, orderBy: latestPrice.orderBy });
      return { ...toIngredientJson(row), prices: prices.map(toPriceJson) };
    },

    async createIngredient(data: Required<Pick<IngredientInput, "name" | "baseUnit">>) {
      const created = await prisma.ingredient.create({ data: { name: data.name, baseUnit: data.baseUnit } });
      return { id: created.id };
    },

    /** Nombre, activo y equivalencias ("1 unidad = X g / ml"). La unidad habitual ya no limita nada. */
    async updateIngredient(id: string, data: IngredientInput): Promise<Result<{ id: string }>> {
      const row = await getIngredientRow(id);
      if (!row) return notFound;
      await prisma.ingredient.update({ where: { id }, data });
      return { ok: true, data: { id } };
    },

    /** Bloqueado mientras se use en recetas (se puede marcar inactivo). Borra su historial de precios. */
    async deleteIngredient(id: string): Promise<Result<null>> {
      const row = await getIngredientRow(id);
      if (!row) return notFound;
      if (row.recipeCount > 0) return { ok: false, status: 409, error: "ingredient_in_use", recipeCount: row.recipeCount };
      await prisma.ingredient.delete({ where: { id } });
      return { ok: true, data: null };
    },

    async getIngredientBaseUnit(id: string) {
      return (await prisma.ingredient.findUnique({ where: { id }, select: { baseUnit: true } }))?.baseUnit ?? null;
    },

    async addPrice(ingredientId: string, data: PriceData) {
      await prisma.ingredientPrice.create({ data: { ingredientId, ...data } });
    },

    /**
     * Corrige una compra mal cargada (no crea otra): cantidad, unidad, precio,
     * proveedor y fecha, con la cantidad base y el costo recalculados.
     */
    async updatePrice(ingredientId: string, priceId: string, data: PriceData) {
      const { count } = await prisma.ingredientPrice.updateMany({ where: { id: priceId, ingredientId }, data });
      return count === 1;
    },

    /** Al borrar una compra, el costo actual pasa solo a la anterior (siempre se lee la más reciente). */
    async deletePrice(ingredientId: string, priceId: string) {
      const { count } = await prisma.ingredientPrice.deleteMany({ where: { id: priceId, ingredientId } });
      return count === 1;
    },

    /* ---------- Recetas ---------- */

    async listRecipes(q?: string) {
      const rows = await prisma.recipe.findMany({ where: search(q), include: recipeInclude, orderBy: [{ active: "desc" }, { name: "asc" }] });
      return rows.map(recipeJson);
    },

    async getRecipe(id: string) {
      const row = await prisma.recipe.findUnique({ where: { id }, include: recipeInclude });
      return row ? recipeJson(row) : null;
    },

    /** Receta + ingredientes + gastos en UNA transacción (nunca queda a medias). */
    async createRecipe(input: RecipeInput): Promise<Result<{ id: string }>> {
      const fields = await checkLines(input, new Set());
      if (Object.keys(fields).length) return { ok: false, status: 422, error: "validation_error", fields };
      const id = await prisma.$transaction(async (tx) => {
        const recipe = await tx.recipe.create({ data: { name: input.name, yieldQuantity: input.yieldQuantity, status: input.status ?? "COMPLETE", notes: input.notes ?? null } });
        const { lines, extras } = lineRows(recipe.id, input);
        if (lines.length) await tx.recipeIngredient.createMany({ data: lines });
        if (extras.length) await tx.recipeExtraCost.createMany({ data: extras });
        return recipe.id;
      });
      return { ok: true, data: { id } };
    },

    /** Reemplaza nombre, rendimiento, ingredientes y gastos en una transacción. */
    async updateRecipe(id: string, input: RecipeInput): Promise<Result<{ id: string }>> {
      const current = await prisma.recipe.findUnique({ where: { id }, select: { status: true, ingredients: { select: { ingredientId: true } } } });
      if (!current) return notFound;
      // Sin estado en el pedido se conserva el actual: el rendimiento vacío solo vale en borrador.
      if (input.yieldQuantity === null && (input.status ?? current.status) !== "DRAFT") {
        return { ok: false, status: 422, error: "validation_error", fields: { yieldQuantity: "Una receta completa necesita rendimiento (cuántas cookies salen)." } };
      }
      // Un ingrediente inactivo puede seguir en la receta que ya lo usaba.
      const fields = await checkLines(input, new Set(current.ingredients.map((l) => l.ingredientId)));
      if (Object.keys(fields).length) return { ok: false, status: 422, error: "validation_error", fields };
      await prisma.$transaction(async (tx) => {
        await tx.recipe.update({
          where: { id },
          data: {
            name: input.name,
            yieldQuantity: input.yieldQuantity,
            ...(input.status ? { status: input.status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
        await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
        await tx.recipeExtraCost.deleteMany({ where: { recipeId: id } });
        const { lines, extras } = lineRows(id, input);
        if (lines.length) await tx.recipeIngredient.createMany({ data: lines });
        if (extras.length) await tx.recipeExtraCost.createMany({ data: extras });
      });
      return { ok: true, data: { id } };
    },

    /**
     * Simulador: lee las recetas (con el costo actual de cada ingrediente) y calcula.
     * No escribe nada. Una receta sin rendimiento no se puede simular (422).
     */
    async simulate(items: SimulationItem[]): Promise<Result<ReturnType<typeof simulateProduction>>> {
      const rows = await prisma.recipe.findMany({ where: { id: { in: items.map((i) => i.recipeId) } }, include: recipeInclude });
      const recipes = new Map(rows.map((r) => [r.id, toRecipeRow(r)]));
      const fields: Record<string, string> = {};
      items.forEach((item, i) => {
        const recipe = recipes.get(item.recipeId);
        if (!recipe) fields[`items.${i}.recipeId`] = "Esa receta ya no existe.";
        else if (!recipe.yieldQuantity) fields[`items.${i}.recipeId`] = "Definí primero el rendimiento de esta receta para poder simularla.";
      });
      if (Object.keys(fields).length) return { ok: false, status: 422, error: "validation_error", fields };
      return { ok: true, data: simulateProduction(recipes, items) };
    },

    async deleteRecipe(id: string) {
      const { count } = await prisma.recipe.deleteMany({ where: { id } });
      return count === 1;
    },
  };
}

export type ManagementRepository = ReturnType<typeof createManagementRepository>;
