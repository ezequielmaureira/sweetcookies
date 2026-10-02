/**
 * Gestión de costos (ingredientes, precios y recetas): unidades, conversiones,
 * validación y cálculo de costos. Lógica pura (sin DB ni HTTP).
 *
 * Todo el cálculo usa Decimal (nunca Float):
 *   compra → cantidad en unidad base (g, ml o unidades) → costo por unidad base
 *   receta → cantidad en unidad base × costo actual = subtotal
 *   total receta = ingredientes + gastos · costo por cookie = total / rendimiento
 */
import { Prisma } from "./generated/prisma/client.ts";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
export type MeasureUnit = "G" | "KG" | "ML" | "L" | "UNIT" | "PACKAGE";

export const BASE_UNITS: readonly BaseUnit[] = ["GRAM", "MILLILITER", "UNIT"];

/** Unidades permitidas por unidad base (PACKAGE solo para compras). */
const PURCHASE_UNITS: Record<BaseUnit, readonly MeasureUnit[]> = {
  GRAM: ["G", "KG"],
  MILLILITER: ["ML", "L"],
  UNIT: ["UNIT", "PACKAGE"],
};
const RECIPE_UNITS: Record<BaseUnit, readonly MeasureUnit[]> = {
  GRAM: ["G", "KG"],
  MILLILITER: ["ML", "L"],
  UNIT: ["UNIT"],
};

/** Factor a la unidad base: 1 kg = 1000 g · 1 l = 1000 ml. */
const FACTOR: Record<Exclude<MeasureUnit, "PACKAGE">, number> = { G: 1, KG: 1000, ML: 1, L: 1000, UNIT: 1 };

/** Cantidad en unidad base (PACKAGE = paquetes × unidades por paquete). */
export function toBaseQuantity(quantity: Decimal, unit: MeasureUnit, unitsPerPackage?: Decimal | null): Decimal {
  if (unit === "PACKAGE") return quantity.mul(unitsPerPackage ?? 0);
  return quantity.mul(FACTOR[unit]);
}

/* ---------- Validación ---------- */

type Errors = Record<string, string>;
export type Validation<T> = { ok: true; data: T } | { ok: false; errors: Errors };

const QUANTITY = /^\d{1,10}(\.\d{1,4})?$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MAX = 80;

const obj = (input: unknown): Record<string, unknown> => (typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {});

/** "1.25", "1,25" o 1.25 → Decimal. null si no es un número válido. */
function decimalFrom(value: unknown, pattern: RegExp): Decimal | null {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
  return pattern.test(text) ? new Decimal(text) : null;
}

function nameFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name && name.length <= NAME_MAX ? name : null;
}

export type IngredientInput = { name?: string; baseUnit?: BaseUnit; active?: boolean };

export function validateIngredientInput(input: unknown, partial: boolean): Validation<IngredientInput> {
  const body = obj(input);
  const errors: Errors = {};
  const data: IngredientInput = {};
  if (!partial || body.name !== undefined) {
    const name = nameFrom(body.name);
    if (name) data.name = name;
    else errors.name = `Escribí un nombre (máximo ${NAME_MAX} caracteres).`;
  }
  if (!partial || body.baseUnit !== undefined) {
    if (BASE_UNITS.includes(body.baseUnit as BaseUnit)) data.baseUnit = body.baseUnit as BaseUnit;
    else errors.baseUnit = "Elegí gramos, mililitros o unidades.";
  }
  if (body.active !== undefined) {
    if (typeof body.active === "boolean") data.active = body.active;
    else errors.active = "Valor inválido.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

export type PriceData = {
  purchaseQuantity: Decimal;
  purchaseUnit: MeasureUnit;
  unitsPerPackage: Decimal | null;
  baseQuantity: Decimal;
  totalPrice: Decimal;
  unitCost: Decimal;
  supplierName: string | null;
  purchasedAt: Date;
};

/** Compra: cantidad + unidad + precio total → costo por unidad base. */
export function validatePriceInput(input: unknown, baseUnit: BaseUnit): Validation<PriceData> {
  const body = obj(input);
  const errors: Errors = {};

  const quantity = decimalFrom(body.quantity, QUANTITY);
  if (!quantity || quantity.lte(0)) errors.quantity = "Ingresá cuánto compraste (mayor a 0).";

  const unit = body.unit as MeasureUnit;
  if (!PURCHASE_UNITS[baseUnit].includes(unit)) errors.unit = "Elegí una unidad válida para este ingrediente.";

  let unitsPerPackage: Decimal | null = null;
  if (unit === "PACKAGE") {
    unitsPerPackage = decimalFrom(body.unitsPerPackage, QUANTITY);
    if (!unitsPerPackage || unitsPerPackage.lte(0)) errors.unitsPerPackage = "Ingresá cuántas unidades trae cada paquete.";
  }

  const totalPrice = decimalFrom(body.totalPrice, MONEY);
  if (!totalPrice || totalPrice.lte(0)) errors.totalPrice = "Ingresá el precio total pagado (mayor a 0).";

  let purchasedAt: Date | null = null;
  if (typeof body.purchasedAt === "string" && DATE.test(body.purchasedAt)) {
    const date = new Date(`${body.purchasedAt}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().startsWith(body.purchasedAt)) purchasedAt = date;
  }
  if (!purchasedAt) errors.purchasedAt = "Elegí la fecha de compra.";

  let supplierName: string | null = null;
  if (typeof body.supplierName === "string" && body.supplierName.trim()) {
    supplierName = nameFrom(body.supplierName);
    if (!supplierName) errors.supplierName = `Máximo ${NAME_MAX} caracteres.`;
  }

  if (Object.keys(errors).length || !quantity || !totalPrice || !purchasedAt) return { ok: false, errors };
  const baseQuantity = toBaseQuantity(quantity, unit, unitsPerPackage);
  if (baseQuantity.lte(0)) return { ok: false, errors: { quantity: "La cantidad comprada no puede ser 0." } };
  return {
    ok: true,
    data: {
      purchaseQuantity: quantity,
      purchaseUnit: unit,
      unitsPerPackage,
      baseQuantity,
      totalPrice,
      unitCost: totalPrice.div(baseQuantity).toDecimalPlaces(10),
      supplierName,
      purchasedAt,
    },
  };
}

export type RecipeLineInput = { ingredientId: string; quantity: Decimal; unit: MeasureUnit };
export type RecipeExtraInput = { name: string; amount: Decimal };
export type RecipeStatus = "DRAFT" | "COMPLETE";
/** status/notes ausentes = no se cambian al editar (en una receta nueva: COMPLETE, sin notas). */
export type RecipeInput = { name: string; yieldQuantity: number | null; status?: RecipeStatus; notes?: string | null; lines: RecipeLineInput[]; extras: RecipeExtraInput[] };

export const RECIPE_NOTES_MAX = 1000;

export const RECIPE_MAX_LINES = 80;

/**
 * Receta completa (crear o reemplazar). La unidad de cada línea se valida
 * contra el ingrediente en el repositorio (acá solo forma y números).
 */
export function validateRecipeInput(input: unknown): Validation<RecipeInput> {
  const body = obj(input);
  const errors: Errors = {};

  const name = nameFrom(body.name);
  if (!name) errors.name = `Escribí un nombre (máximo ${NAME_MAX} caracteres).`;

  let status: RecipeStatus | undefined;
  if (body.status !== undefined) {
    if (body.status === "DRAFT" || body.status === "COMPLETE") status = body.status;
    else errors.status = "Elegí Borrador o Completa.";
  }

  // Rendimiento: entero ≥ 1. Solo un BORRADOR puede dejarlo pendiente (null / vacío).
  const rawYield = typeof body.yieldQuantity === "string" ? body.yieldQuantity.trim() : body.yieldQuantity;
  let yieldQuantity: number | null = null;
  if (rawYield === null || rawYield === undefined || rawYield === "") {
    if (status !== "DRAFT") errors.yieldQuantity = "Una receta completa necesita rendimiento (cuántas cookies salen).";
  } else {
    const n = typeof rawYield === "string" ? Number(rawYield) : rawYield;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10000) errors.yieldQuantity = "Ingresá cuántas cookies salen (número entero mayor a 0).";
    else yieldQuantity = n;
  }

  let notes: string | null | undefined;
  if (body.notes !== undefined) {
    if (body.notes === null) notes = null;
    else if (typeof body.notes !== "string") errors.notes = "Formato inválido.";
    else {
      const text = body.notes.replace(/\r\n?/g, "\n").trim();
      if (text.length > RECIPE_NOTES_MAX) errors.notes = `Máximo ${RECIPE_NOTES_MAX} caracteres.`;
      else notes = text || null;
    }
  }

  const rawLines = Array.isArray(body.ingredients) ? body.ingredients : [];
  if (rawLines.length > RECIPE_MAX_LINES) errors.ingredients = `Máximo ${RECIPE_MAX_LINES} ingredientes.`;
  const lines: RecipeLineInput[] = [];
  rawLines.slice(0, RECIPE_MAX_LINES).forEach((raw, i) => {
    const line = obj(raw);
    const ingredientId = typeof line.ingredientId === "string" ? line.ingredientId : "";
    const quantity = decimalFrom(line.quantity, QUANTITY);
    const unit = line.unit as MeasureUnit;
    if (!ingredientId) errors[`ingredients.${i}.ingredientId`] = "Elegí un ingrediente.";
    if (!quantity || quantity.lte(0)) errors[`ingredients.${i}.quantity`] = "Ingresá la cantidad (mayor a 0).";
    if (!["G", "KG", "ML", "L", "UNIT"].includes(unit)) errors[`ingredients.${i}.unit`] = "Elegí la unidad.";
    if (ingredientId && quantity && quantity.gt(0)) lines.push({ ingredientId, quantity, unit });
  });

  const rawExtras = Array.isArray(body.extraCosts) ? body.extraCosts : [];
  if (rawExtras.length > RECIPE_MAX_LINES) errors.extraCosts = `Máximo ${RECIPE_MAX_LINES} gastos.`;
  const extras: RecipeExtraInput[] = [];
  rawExtras.slice(0, RECIPE_MAX_LINES).forEach((raw, i) => {
    const extra = obj(raw);
    const extraName = nameFrom(extra.name);
    const amount = decimalFrom(extra.amount, MONEY);
    if (!extraName) errors[`extraCosts.${i}.name`] = "Escribí el concepto.";
    if (!amount) errors[`extraCosts.${i}.amount`] = "Ingresá el monto.";
    if (extraName && amount) extras.push({ name: extraName, amount });
  });

  if (Object.keys(errors).length || !name) return { ok: false, errors };
  return { ok: true, data: { name, yieldQuantity, status, notes, lines, extras } };
}

/** ¿Esa unidad sirve para ese ingrediente en una receta? */
export const isRecipeUnitFor = (baseUnit: BaseUnit, unit: MeasureUnit) => RECIPE_UNITS[baseUnit].includes(unit);

/* ---------- Costos ---------- */

export type PriceRow = {
  id: string;
  purchaseQuantity: Decimal;
  purchaseUnit: MeasureUnit;
  unitsPerPackage: Decimal | null;
  baseQuantity: Decimal;
  totalPrice: Decimal;
  unitCost: Decimal;
  supplierName: string | null;
  purchasedAt: Date;
  createdAt: Date;
};

export type IngredientRow = {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Compra más reciente (costo actual), o null si no tiene precios. */
  currentPrice: PriceRow | null;
  recipeCount: number;
  priceCount: number;
};

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const money = (d: Decimal) => d.toFixed(2);

export const toPriceJson = (p: PriceRow) => ({
  id: p.id,
  purchaseQuantity: p.purchaseQuantity.toString(),
  purchaseUnit: p.purchaseUnit,
  unitsPerPackage: p.unitsPerPackage?.toString() ?? null,
  baseQuantity: p.baseQuantity.toString(),
  totalPrice: money(p.totalPrice),
  unitCost: p.unitCost.toString(),
  supplierName: p.supplierName,
  purchasedAt: dateOnly(p.purchasedAt),
  createdAt: p.createdAt.toISOString(),
});

export const toIngredientJson = (i: IngredientRow) => ({
  id: i.id,
  name: i.name,
  baseUnit: i.baseUnit,
  active: i.active,
  createdAt: i.createdAt.toISOString(),
  updatedAt: i.updatedAt.toISOString(),
  /** Costo actual por unidad base (string con precisión completa) o null = sin precio. */
  unitCost: i.currentPrice?.unitCost.toString() ?? null,
  lastPriceDate: i.currentPrice ? dateOnly(i.currentPrice.purchasedAt) : null,
  recipeCount: i.recipeCount,
  priceCount: i.priceCount,
});

export type RecipeRow = {
  id: string;
  name: string;
  yieldQuantity: number | null;
  status: RecipeStatus;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lines: { id: string; quantity: Decimal; unit: MeasureUnit; ingredient: { id: string; name: string; baseUnit: BaseUnit; active: boolean; unitCost: Decimal | null } }[];
  extras: { id: string; name: string; amount: Decimal }[];
};

/**
 * Costo de la receta con los precios ACTUALES. Si falta el precio de algún
 * ingrediente, el costo queda incompleto (nunca se asume 0). Sin rendimiento
 * (borrador) no hay costo por cookie. En un BORRADOR el costo es siempre
 * PARCIAL: la web no lo presenta como definitivo.
 */
export function computeRecipe(r: RecipeRow) {
  let ingredientsCost = new Decimal(0);
  let missing = 0;
  const lines = r.lines.map((line) => {
    const baseQuantity = toBaseQuantity(line.quantity, line.unit);
    const unitCost = line.ingredient.unitCost;
    const subtotal = unitCost ? baseQuantity.mul(unitCost) : null;
    if (subtotal) ingredientsCost = ingredientsCost.add(subtotal);
    else missing++;
    return {
      id: line.id,
      ingredientId: line.ingredient.id,
      ingredientName: line.ingredient.name,
      ingredientActive: line.ingredient.active,
      baseUnit: line.ingredient.baseUnit,
      quantity: line.quantity.toString(),
      unit: line.unit,
      baseQuantity: baseQuantity.toString(),
      unitCost: unitCost?.toString() ?? null,
      subtotal: subtotal ? money(subtotal) : null,
    };
  });
  const extrasCost = r.extras.reduce((sum, e) => sum.add(e.amount), new Decimal(0));
  const complete = missing === 0;
  const total = ingredientsCost.add(extrasCost);
  return {
    id: r.id,
    name: r.name,
    yieldQuantity: r.yieldQuantity,
    status: r.status,
    notes: r.notes,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    ingredients: lines,
    extraCosts: r.extras.map((e) => ({ id: e.id, name: e.name, amount: money(e.amount) })),
    summary: {
      complete,
      missingPrices: missing,
      /** Con faltantes: suma parcial (solo de referencia); total y por cookie = null. */
      ingredientsCost: money(ingredientsCost),
      extrasCost: money(extrasCost),
      /** Suma de lo que tiene precio (ingredientes + gastos): en borrador es el "costo parcial". */
      knownCost: money(total),
      totalCost: complete ? money(total) : null,
      costPerCookie: complete && r.yieldQuantity ? money(total.div(r.yieldQuantity)) : null,
    },
  };
}

/* ---------- Simulador de producción (solo cálculo: no guarda nada) ---------- */

export type SimulationItem = { recipeId: string; cookies: number };

export const SIMULATION_MAX_ITEMS = 50;

const validCookies = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 100000;

/** Pedido del simulador: { items: [{ recipeId, cookies }] }, cookies entero ≥ 1, sin recetas repetidas. */
export function validateSimulationInput(input: unknown): Validation<SimulationItem[]> {
  const raw = obj(input).items;
  if (!Array.isArray(raw) || raw.length > SIMULATION_MAX_ITEMS) return { ok: false, errors: { items: `Entre 0 y ${SIMULATION_MAX_ITEMS} recetas.` } };
  const errors: Errors = {};
  const seen = new Set<string>();
  const items: SimulationItem[] = [];
  raw.forEach((value, i) => {
    const item = obj(value);
    const recipeId = typeof item.recipeId === "string" ? item.recipeId : "";
    const cookies = typeof item.cookies === "string" ? Number(item.cookies) : item.cookies;
    if (!recipeId) errors[`items.${i}.recipeId`] = "Elegí una receta.";
    else if (seen.has(recipeId)) errors[`items.${i}.recipeId`] = "Esa receta ya está en la simulación.";
    else if (!validCookies(cookies)) errors[`items.${i}.cookies`] = "Cantidad de cookies inválida.";
    else items.push({ recipeId, cookies });
    seen.add(recipeId);
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: items };
}

/** Cuántas veces hay que hacer la receta: cookies pedidas / rendimiento (sin redondear: 15 / 10 = 1,5). */
export const recipeScaleFactor = (cookies: number, yieldQuantity: number) => new Decimal(cookies).div(yieldQuantity);

/**
 * Simulación TEÓRICA de producción con los costos ACTUALES (misma conversión
 * a unidad base y mismo costo actual que computeRecipe). Escala ingredientes y
 * gastos por el factor de cada receta, agrupa ingredientes iguales y suma.
 * Sin precio → costo incompleto (nunca 0). Todo en Decimal; se redondea solo
 * al devolver.
 *
 * Etapa 2: cada ingrediente sale con su id y cantidad en unidad base, listo para
 * cruzar con stock (faltante = necesario − stock) y armar la lista de compras;
 * los items (recetaId + cookies) pueden venir de los pedidos pendientes.
 */
export function simulateProduction(recipes: Map<string, RecipeRow>, items: SimulationItem[]) {
  type Total = { id: string; name: string; baseUnit: BaseUnit; unitCost: Decimal | null; quantity: Decimal; usedIn: string[] };
  const totals = new Map<string, Total>();
  let totalCookies = 0;
  let extrasCost = new Decimal(0);
  let hasDraft = false;

  const detail = items.map(({ recipeId, cookies }) => {
    const r = recipes.get(recipeId)!;
    const factor = recipeScaleFactor(cookies, r.yieldQuantity!);
    let recipeIngredients = new Decimal(0);
    let missing = 0;
    for (const line of r.lines) {
      const quantity = toBaseQuantity(line.quantity, line.unit).mul(factor);
      const unitCost = line.ingredient.unitCost;
      if (unitCost) recipeIngredients = recipeIngredients.add(quantity.mul(unitCost));
      else missing++;
      const t: Total = totals.get(line.ingredient.id) ?? { id: line.ingredient.id, name: line.ingredient.name, baseUnit: line.ingredient.baseUnit, unitCost, quantity: new Decimal(0), usedIn: [] };
      t.quantity = t.quantity.add(quantity);
      if (!t.usedIn.includes(r.name)) t.usedIn.push(r.name);
      totals.set(line.ingredient.id, t);
    }
    const recipeExtras = r.extras.reduce((sum, e) => sum.add(e.amount), new Decimal(0)).mul(factor);
    const complete = missing === 0;
    const total = recipeIngredients.add(recipeExtras);
    totalCookies += cookies;
    extrasCost = extrasCost.add(recipeExtras);
    if (r.status === "DRAFT") hasDraft = true;
    return {
      recipeId,
      name: r.name,
      status: r.status,
      cookies,
      yieldQuantity: r.yieldQuantity,
      /** Equivalencia en recetas (20 / 10 = 2; 15 / 10 = 1,5). */
      factor: factor.toDecimalPlaces(4).toString(),
      /** Costo de UNA receta base (null si le faltan precios). */
      baseCost: computeRecipe(r).summary.totalCost,
      missingPrices: missing,
      ingredientsCost: money(recipeIngredients),
      extrasCost: money(recipeExtras),
      knownCost: money(total),
      totalCost: complete ? money(total) : null,
      costPerCookie: complete ? money(total.div(cookies)) : null,
    };
  });

  let ingredientsCost = new Decimal(0);
  const ingredients = [...totals.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
    .map((t) => {
      const cost = t.unitCost ? t.quantity.mul(t.unitCost) : null;
      if (cost) ingredientsCost = ingredientsCost.add(cost);
      return {
        ingredientId: t.id,
        name: t.name,
        baseUnit: t.baseUnit,
        /** Cantidad necesaria en unidad base (g, ml o unidades). */
        quantity: t.quantity.toDecimalPlaces(4).toString(),
        unitCost: t.unitCost?.toString() ?? null,
        cost: cost ? money(cost) : null,
        usedIn: t.usedIn,
      };
    });

  const missingPrices = ingredients.filter((i) => !i.unitCost).length;
  const complete = missingPrices === 0;
  const total = ingredientsCost.add(extrasCost);
  return {
    recipes: detail,
    ingredients,
    summary: {
      totalCookies,
      /** Incluye recetas en borrador: la simulación puede no tener todos los ingredientes. */
      hasDraft,
      complete,
      missingPrices,
      ingredientsCost: money(ingredientsCost),
      extrasCost: money(extrasCost),
      knownCost: money(total),
      totalCost: complete ? money(total) : null,
      averagePerCookie: complete && totalCookies > 0 ? money(total.div(totalCookies)) : null,
    },
  };
}
