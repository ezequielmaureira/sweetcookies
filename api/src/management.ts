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
export type RecipeInput = { name: string; yieldQuantity: number; lines: RecipeLineInput[]; extras: RecipeExtraInput[] };

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

  const yieldQuantity = typeof body.yieldQuantity === "string" ? Number(body.yieldQuantity.trim()) : body.yieldQuantity;
  if (typeof yieldQuantity !== "number" || !Number.isInteger(yieldQuantity) || yieldQuantity < 1 || yieldQuantity > 10000)
    errors.yieldQuantity = "Ingresá cuántas cookies rinde (número entero, 1 o más).";

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
  return { ok: true, data: { name, yieldQuantity: yieldQuantity as number, lines, extras } };
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
  yieldQuantity: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lines: { id: string; quantity: Decimal; unit: MeasureUnit; ingredient: { id: string; name: string; baseUnit: BaseUnit; active: boolean; unitCost: Decimal | null } }[];
  extras: { id: string; name: string; amount: Decimal }[];
};

/**
 * Costo de la receta con los precios ACTUALES. Si falta el precio de algún
 * ingrediente, el costo queda incompleto (nunca se asume 0).
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
      totalCost: complete ? money(total) : null,
      costPerCookie: complete ? money(total.div(r.yieldQuantity)) : null,
    },
  };
}
