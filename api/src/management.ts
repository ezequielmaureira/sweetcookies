/**
 * Gestión de costos (ingredientes, precios y recetas): unidades, conversiones,
 * validación y cálculo de costos. Lógica pura (sin DB ni HTTP).
 *
 * Todo el cálculo usa Decimal (nunca Float):
 *   compra → cantidad en g, ml o unidades (según SU unidad) → costo por g / ml / unidad
 *   receta → cantidad (en SU unidad) convertida a la de la compra × costo = subtotal
 *   total receta = ingredientes + gastos · costo por cookie = total / rendimiento
 *
 * Un ingrediente se puede comprar y usar en cualquier unidad (g, kg, ml, litro,
 * unidad). Conversiones (un solo motor: convertBase / costPerBase):
 *   - siempre: kg ↔ g, litro ↔ ml;
 *   - unidad ↔ g / ml: solo con la equivalencia del ingrediente ("1 unidad = 22 g");
 *   - g ↔ ml: nunca (haría falta la densidad).
 * Sin conversión posible el costo queda incompleto ("falta equivalencia"), nunca 0.
 */
import { Prisma } from "./generated/prisma/client.ts";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
export type MeasureUnit = "G" | "KG" | "ML" | "L" | "UNIT" | "PACKAGE";

export const BASE_UNITS: readonly BaseUnit[] = ["GRAM", "MILLILITER", "UNIT"];

/** Unidades de compra y de receta, para cualquier ingrediente (PACKAGE: solo compras viejas). */
const PURCHASE_UNITS: readonly MeasureUnit[] = ["G", "KG", "ML", "L", "UNIT", "PACKAGE"];
const RECIPE_UNITS: readonly MeasureUnit[] = ["G", "KG", "ML", "L", "UNIT"];

/** Factor a la unidad base: 1 kg = 1000 g · 1 l = 1000 ml. */
const FACTOR: Record<Exclude<MeasureUnit, "PACKAGE">, number> = { G: 1, KG: 1000, ML: 1, L: 1000, UNIT: 1 };

/** Cantidad en unidad base (PACKAGE = paquetes × unidades por paquete). */
export function toBaseQuantity(quantity: Decimal, unit: MeasureUnit, unitsPerPackage?: Decimal | null): Decimal {
  if (unit === "PACKAGE") return quantity.mul(unitsPerPackage ?? 0);
  return quantity.mul(FACTOR[unit]);
}

/** Dimensión de una unidad: peso (en g), volumen (en ml) o cantidad (en unidades). */
export const dimensionOf = (unit: MeasureUnit): BaseUnit => (unit === "G" || unit === "KG" ? "GRAM" : unit === "ML" || unit === "L" ? "MILLILITER" : "UNIT");

/** Equivalencias del ingrediente: "1 unidad = X g" / "1 unidad = X ml" (null = no definida). */
export type Equivalences = { gramsPerUnit: Decimal | null; mlPerUnit: Decimal | null };

/**
 * Pasa una cantidad de una dimensión a otra (g, ml o unidades). null = no se
 * puede: falta la equivalencia del ingrediente, o es g ↔ ml (necesita densidad).
 */
export function convertBase(quantity: Decimal, from: BaseUnit, to: BaseUnit, eq: Equivalences): Decimal | null {
  if (from === to) return quantity;
  if (from === "UNIT" && to === "GRAM") return eq.gramsPerUnit ? quantity.mul(eq.gramsPerUnit) : null;
  if (from === "GRAM" && to === "UNIT") return eq.gramsPerUnit ? quantity.div(eq.gramsPerUnit) : null;
  if (from === "UNIT" && to === "MILLILITER") return eq.mlPerUnit ? quantity.mul(eq.mlPerUnit) : null;
  if (from === "MILLILITER" && to === "UNIT") return eq.mlPerUnit ? quantity.div(eq.mlPerUnit) : null;
  return null;
}

/** Precio vigente: costo por g / ml / unidad de la dimensión en que se COMPRÓ. */
export type CurrentCost = { unitCost: Decimal; dimension: BaseUnit };

/**
 * Costo actual expresado en la dimensión que necesita la receta.
 * Ej.: compra 1 barra a $1.590,80 + "1 unidad = 22 g" → $72,31 / g.
 * null = no hay conversión posible (falta equivalencia).
 */
export function costPerBase(price: CurrentCost, dimension: BaseUnit, eq: Equivalences): Decimal | null {
  const inPurchaseDimension = convertBase(new Decimal(1), dimension, price.dimension, eq);
  return inPurchaseDimension ? price.unitCost.mul(inPurchaseDimension) : null;
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

export type IngredientInput = { name?: string; baseUnit?: BaseUnit; active?: boolean; gramsPerUnit?: Decimal | null; mlPerUnit?: Decimal | null };

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
  // Equivalencias: número > 0, o null / "" para quitarla.
  for (const key of ["gramsPerUnit", "mlPerUnit"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null || value === "") data[key] = null;
    else {
      const d = decimalFrom(value, QUANTITY);
      if (d && d.gt(0)) data[key] = d;
      else errors[key] = "Ingresá un número mayor a 0.";
    }
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

/**
 * Compra: cantidad + unidad (cualquiera: g, kg, ml, litro, unidad) + precio
 * total → costo por g / ml / unidad, según la unidad de ESA compra.
 */
export function validatePriceInput(input: unknown): Validation<PriceData> {
  const body = obj(input);
  const errors: Errors = {};

  const quantity = decimalFrom(body.quantity, QUANTITY);
  if (!quantity || quantity.lte(0)) errors.quantity = "Ingresá cuánto compraste (mayor a 0).";

  const unit = body.unit as MeasureUnit;
  if (!PURCHASE_UNITS.includes(unit)) errors.unit = "Elegí g, kg, ml, litro o unidad.";

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

/**
 * Parte de la receta a la que pertenece cada ingrediente. UNASSIGNED = "Sin
 * clasificar" (líneas anteriores a esta separación que el admin debe revisar).
 */
export type RecipeComponent = "UNASSIGNED" | "DOUGH" | "FILLING";
export const RECIPE_COMPONENTS: readonly RecipeComponent[] = ["DOUGH", "FILLING", "UNASSIGNED"];

export type RecipeLineInput = { ingredientId: string; quantity: Decimal; unit: MeasureUnit; component: RecipeComponent };
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
    // Sin parte (clientes anteriores) = "Sin clasificar".
    const component = line.component === undefined ? "UNASSIGNED" : (line.component as RecipeComponent);
    if (!RECIPE_COMPONENTS.includes(component)) errors[`ingredients.${i}.component`] = "Elegí masa o relleno.";
    if (!ingredientId) errors[`ingredients.${i}.ingredientId`] = "Elegí un ingrediente.";
    if (!quantity || quantity.lte(0)) errors[`ingredients.${i}.quantity`] = "Ingresá la cantidad (mayor a 0).";
    if (!RECIPE_UNITS.includes(unit)) errors[`ingredients.${i}.unit`] = "Elegí la unidad.";
    if (ingredientId && quantity && quantity.gt(0)) lines.push({ ingredientId, quantity, unit, component });
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
  gramsPerUnit: Decimal | null;
  mlPerUnit: Decimal | null;
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
  /** "1 unidad = X g" / "1 unidad = X ml" (null = sin equivalencia). */
  gramsPerUnit: i.gramsPerUnit?.toString() ?? null,
  mlPerUnit: i.mlPerUnit?.toString() ?? null,
  createdAt: i.createdAt.toISOString(),
  updatedAt: i.updatedAt.toISOString(),
  /** Costo actual (precisión completa) por g / ml / unidad según costUnit, o null = sin precio. */
  unitCost: i.currentPrice?.unitCost.toString() ?? null,
  costUnit: i.currentPrice ? dimensionOf(i.currentPrice.purchaseUnit) : null,
  lastPriceDate: i.currentPrice ? dateOnly(i.currentPrice.purchasedAt) : null,
  /** Compra vigente (precio pagado, cantidad y unidad tal como se cargó), para la vista tipo planilla. */
  currentPrice: i.currentPrice ? toPriceJson(i.currentPrice) : null,
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
  lines: {
    id: string;
    quantity: Decimal;
    unit: MeasureUnit;
    component: RecipeComponent;
    ingredient: { id: string; name: string; baseUnit: BaseUnit; active: boolean; price: CurrentCost | null } & Equivalences;
  }[];
  extras: { id: string; name: string; amount: Decimal }[];
};

/* ---------- Costos por parte (motor común de recetas y simulador) ---------- */

type PartTotals = { known: Decimal; missing: number; lines: number };
type Parts = Record<RecipeComponent, PartTotals>;

const emptyParts = (): Parts => ({
  DOUGH: { known: new Decimal(0), missing: 0, lines: 0 },
  FILLING: { known: new Decimal(0), missing: 0, lines: 0 },
  UNASSIGNED: { known: new Decimal(0), missing: 0, lines: 0 },
});

/** Por qué una línea no tiene costo: sin precio, o sin equivalencia para convertir. */
export type MissingReason = "NO_PRICE" | "NO_EQUIVALENCE";

/**
 * Cada línea de la receta × factor: cantidad (en g / ml / unidades, según la
 * unidad de la LÍNEA) y costo con el precio actual convertido a esa dimensión;
 * acumulado por parte (masa, relleno, sin clasificar).
 * factor = 1 para la receta base; cookies / rendimiento en el simulador.
 */
function costLines(r: RecipeRow, factor: Decimal) {
  const parts = emptyParts();
  const lines = r.lines.map((line) => {
    const dimension = dimensionOf(line.unit);
    const baseQuantity = toBaseQuantity(line.quantity, line.unit).mul(factor);
    const price = line.ingredient.price;
    const unitCost = price ? costPerBase(price, dimension, line.ingredient) : null;
    const missing: MissingReason | null = !price ? "NO_PRICE" : !unitCost ? "NO_EQUIVALENCE" : null;
    const subtotal = unitCost ? baseQuantity.mul(unitCost) : null;
    const part = parts[line.component];
    part.lines++;
    if (subtotal) part.known = part.known.add(subtotal);
    else part.missing++;
    return { line, dimension, baseQuantity, unitCost, subtotal, missing };
  });
  return { lines, parts };
}

const sumParts = (parts: Parts, components: readonly RecipeComponent[]) =>
  components.reduce((acc, c) => ({ known: acc.known.add(parts[c].known), missing: acc.missing + parts[c].missing }), { known: new Decimal(0), missing: 0 });

/** Costo de una parte: null si le falta algún precio (nunca 0). */
const partJson = (p: PartTotals) => ({ cost: p.missing ? null : money(p.known), knownCost: money(p.known), missingPrices: p.missing, lines: p.lines });

const partsJson = (parts: Parts) =>
  Object.fromEntries(RECIPE_COMPONENTS.map((c) => [c, partJson(parts[c])])) as Record<RecipeComponent, ReturnType<typeof partJson>>;

/**
 * Costo de la receta con los precios ACTUALES. Si falta el precio de algún
 * ingrediente, el costo queda incompleto (nunca se asume 0). Sin rendimiento
 * (borrador) no hay costo por cookie. En un BORRADOR el costo es siempre
 * PARCIAL: la web no lo presenta como definitivo. Además, costo por parte.
 */
export function computeRecipe(r: RecipeRow) {
  const { lines, parts } = costLines(r, new Decimal(1));
  const all = sumParts(parts, RECIPE_COMPONENTS);
  const ingredientsCost = all.known;
  const missing = all.missing;
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
    ingredients: lines.map(({ line, dimension, baseQuantity, unitCost, subtotal, missing }) => ({
      id: line.id,
      ingredientId: line.ingredient.id,
      ingredientName: line.ingredient.name,
      ingredientActive: line.ingredient.active,
      /** Dimensión de la línea (g / ml / unidad): unitCost y baseQuantity están en ella. */
      baseUnit: dimension,
      missing,
      component: line.component,
      quantity: line.quantity.toString(),
      unit: line.unit,
      baseQuantity: baseQuantity.toString(),
      unitCost: unitCost?.toString() ?? null,
      subtotal: subtotal ? money(subtotal) : null,
    })),
    extraCosts: r.extras.map((e) => ({ id: e.id, name: e.name, amount: money(e.amount) })),
    summary: {
      complete,
      missingPrices: missing,
      /** Costo de masa / relleno / sin clasificar (cost = null si falta un precio). */
      components: partsJson(parts),
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
    // "quantity" se acepta como sinónimo de "cookies".
    const rawCookies = item.cookies ?? item.quantity;
    const cookies = typeof rawCookies === "string" ? Number(rawCookies) : rawCookies;
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

const addParts = (into: Parts, from: Parts) => {
  for (const c of RECIPE_COMPONENTS) {
    into[c].known = into[c].known.add(from[c].known);
    into[c].missing += from[c].missing;
    into[c].lines += from[c].lines;
  }
};

/**
 * Simulación TEÓRICA de producción con los costos ACTUALES (mismo motor que
 * computeRecipe: costLines). Escala ingredientes y gastos por el factor de cada
 * receta y suma. Sin precio → incompleto (nunca 0).
 *
 * El resultado se separa por parte (masa, relleno) y por variedad:
 * cada ingrediente (agrupado por parte) trae el total combinado y cuánto usa
 * cada receta (byRecipe), así se puede mirar "Ferrero → Relleno" o
 * "Total → Masa" sin volver a calcular. El costo total no cambia con eso.
 *
 * Etapa 2: cada ingrediente sale con su id, parte y cantidad en unidad base,
 * listo para cruzar con stock y armar la lista de compras.
 */
export function simulateProduction(recipes: Map<string, RecipeRow>, items: SimulationItem[]) {
  type Total = {
    id: string;
    name: string;
    baseUnit: BaseUnit;
    component: RecipeComponent;
    unitCost: Decimal | null;
    missing: MissingReason | null;
    quantity: Decimal;
    byRecipe: Map<string, Decimal>;
  };
  const totals = new Map<string, Total>();
  const productionParts = emptyParts();
  let totalCookies = 0;
  let extrasCost = new Decimal(0);
  let hasDraft = false;

  const detail = items.map(({ recipeId, cookies }) => {
    const r = recipes.get(recipeId)!;
    const factor = recipeScaleFactor(cookies, r.yieldQuantity!);
    const { lines, parts } = costLines(r, factor);
    for (const { line, dimension, baseQuantity, unitCost, missing } of lines) {
      // Se agrupa por parte + ingrediente + dimensión (g, ml o unidades no se suman entre sí).
      const key = `${line.component}:${line.ingredient.id}:${dimension}`;
      const t: Total = totals.get(key) ?? {
        id: line.ingredient.id,
        name: line.ingredient.name,
        baseUnit: dimension,
        component: line.component,
        unitCost,
        missing,
        quantity: new Decimal(0),
        byRecipe: new Map(),
      };
      t.quantity = t.quantity.add(baseQuantity);
      // Desglose antes de agrupar: cuánto de este ingrediente (en esta parte) usa cada receta.
      t.byRecipe.set(recipeId, (t.byRecipe.get(recipeId) ?? new Decimal(0)).add(baseQuantity));
      totals.set(key, t);
    }
    addParts(productionParts, parts);
    const all = sumParts(parts, RECIPE_COMPONENTS);
    const recipeExtras = r.extras.reduce((sum, e) => sum.add(e.amount), new Decimal(0)).mul(factor);
    const total = all.known.add(recipeExtras);
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
      /** Costo de cada parte para estas cookies. */
      components: partsJson(parts),
      missingPrices: all.missing,
      ingredientsCost: money(all.known),
      extrasCost: money(recipeExtras),
      knownCost: money(total),
      totalCost: all.missing ? null : money(total),
      costPerCookie: all.missing ? null : money(total.div(cookies)),
    };
  });

  const order = (c: RecipeComponent) => RECIPE_COMPONENTS.indexOf(c);
  const ingredients = [...totals.values()]
    .sort((a, b) => order(a.component) - order(b.component) || a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
    .map((t) => {
      const cost = t.unitCost ? t.quantity.mul(t.unitCost) : null;
      return {
        ingredientId: t.id,
        name: t.name,
        baseUnit: t.baseUnit,
        component: t.component,
        /** null, o por qué no tiene costo: sin precio / falta equivalencia. */
        missing: t.missing,
        /** Cantidad necesaria en g, ml o unidades (según baseUnit). */
        quantity: t.quantity.toDecimalPlaces(4).toString(),
        unitCost: t.unitCost?.toString() ?? null,
        cost: cost ? money(cost) : null,
        /** Por variedad: cantidad y costo de este ingrediente para cada receta (en el orden de la simulación). */
        byRecipe: items
          .filter((item) => t.byRecipe.has(item.recipeId))
          .map((item) => {
            const quantity = t.byRecipe.get(item.recipeId)!;
            return { recipeId: item.recipeId, quantity: quantity.toDecimalPlaces(4).toString(), cost: t.unitCost ? money(quantity.mul(t.unitCost)) : null };
          }),
      };
    });

  const all = sumParts(productionParts, RECIPE_COMPONENTS);
  const missingPrices = new Set(ingredients.filter((i) => !i.unitCost).map((i) => i.ingredientId)).size;
  const complete = all.missing === 0;
  const total = all.known.add(extrasCost);
  return {
    recipes: detail,
    ingredients,
    summary: {
      totalCookies,
      /** Incluye recetas en borrador: la simulación puede no tener todos los ingredientes. */
      hasDraft,
      complete,
      missingPrices,
      /** Costo de masa / relleno / sin clasificar de toda la producción. */
      components: partsJson(productionParts),
      ingredientsCost: money(all.known),
      extrasCost: money(extrasCost),
      knownCost: money(total),
      totalCost: complete ? money(total) : null,
      averagePerCookie: complete && totalCookies > 0 ? money(total.div(totalCookies)) : null,
    },
  };
}
