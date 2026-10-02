import { adminRequest } from "@/lib/admin/admin-api";

/**
 * Gestión de costos (ingredientes, precios y recetas): tipos, API y formato.
 * El cálculo oficial lo hace el backend (Decimal). Acá solo hay una cuenta
 * equivalente en el navegador para mostrar subtotales MIENTRAS se edita.
 */

export type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
export type MeasureUnit = "G" | "KG" | "ML" | "L" | "UNIT" | "PACKAGE";

export type IngredientPrice = {
  id: string;
  purchaseQuantity: string;
  purchaseUnit: MeasureUnit;
  unitsPerPackage: string | null;
  baseQuantity: string;
  totalPrice: string;
  unitCost: string;
  supplierName: string | null;
  purchasedAt: string;
  createdAt: string;
};

export type Ingredient = {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  active: boolean;
  /** Costo actual por unidad base (precisión completa) o null = sin precio. */
  unitCost: string | null;
  lastPriceDate: string | null;
  recipeCount: number;
  priceCount: number;
  createdAt: string;
  updatedAt: string;
};

export type IngredientDetail = Ingredient & { prices: IngredientPrice[] };

/** Parte de la receta. UNASSIGNED = "Sin clasificar" (para revisar). */
export type RecipeComponent = "UNASSIGNED" | "DOUGH" | "FILLING";

export const COMPONENT_LABELS: Record<RecipeComponent, string> = { DOUGH: "Masa", FILLING: "Relleno", UNASSIGNED: "Sin clasificar" };

/** Partes de una cookie, en orden de elaboración. */
export const PARTS: readonly RecipeComponent[] = ["DOUGH", "FILLING"];

/** Costo de una parte: cost = null si le falta algún precio (nunca 0). */
export type PartCost = { cost: string | null; knownCost: string; missingPrices: number; lines: number };

export type RecipeLine = {
  id: string;
  component: RecipeComponent;
  ingredientId: string;
  ingredientName: string;
  ingredientActive: boolean;
  baseUnit: BaseUnit;
  quantity: string;
  unit: MeasureUnit;
  baseQuantity: string;
  unitCost: string | null;
  subtotal: string | null;
};

/** Borrador: faltan datos (rellenos, cantidades, rendimiento). Completa: receta terminada. */
export type RecipeStatus = "DRAFT" | "COMPLETE";

export type Recipe = {
  id: string;
  name: string;
  /** null = rendimiento pendiente (solo en borrador). */
  yieldQuantity: number | null;
  status: RecipeStatus;
  notes: string | null;
  active: boolean;
  ingredients: RecipeLine[];
  extraCosts: { id: string; name: string; amount: string }[];
  summary: {
    complete: boolean;
    missingPrices: number;
    /** Costo de masa / relleno / sin clasificar. */
    components: Record<RecipeComponent, PartCost>;
    ingredientsCost: string;
    extrasCost: string;
    /** Lo que tiene precio (ingredientes + gastos). En borrador = costo parcial. */
    knownCost: string;
    totalCost: string | null;
    costPerCookie: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type PriceInput = { quantity: string; unit: MeasureUnit; unitsPerPackage?: string; totalPrice: string; purchasedAt: string; supplierName?: string };

export type RecipeInput = {
  name: string;
  yieldQuantity: number | null;
  status: RecipeStatus;
  notes: string | null;
  ingredients: { ingredientId: string; quantity: string; unit: MeasureUnit; component: RecipeComponent }[];
  extraCosts: { name: string; amount: string }[];
};

/* ---------- API (solo admin) ---------- */

export const listIngredients = (token: string | null) => adminRequest<{ ingredients: Ingredient[] }>("/api/admin/ingredients", token);
export const getIngredient = (token: string | null, id: string) => adminRequest<IngredientDetail>(`/api/admin/ingredients/${encodeURIComponent(id)}`, token);
export const createIngredient = (token: string | null, input: { name: string; baseUnit: BaseUnit }) =>
  adminRequest<IngredientDetail>("/api/admin/ingredients", token, { method: "POST", body: JSON.stringify(input) });
export const updateIngredient = (token: string | null, id: string, input: { name?: string; active?: boolean; baseUnit?: BaseUnit }) =>
  adminRequest<IngredientDetail>(`/api/admin/ingredients/${encodeURIComponent(id)}`, token, { method: "PATCH", body: JSON.stringify(input) });
export const deleteIngredient = (token: string | null, id: string) =>
  adminRequest<void>(`/api/admin/ingredients/${encodeURIComponent(id)}`, token, { method: "DELETE" });
export const addIngredientPrice = (token: string | null, id: string, input: PriceInput) =>
  adminRequest<IngredientDetail>(`/api/admin/ingredients/${encodeURIComponent(id)}/prices`, token, { method: "POST", body: JSON.stringify(input) });
/** Corrige una compra mal cargada (no crea otra). */
export const updateIngredientPrice = (token: string | null, id: string, priceId: string, input: PriceInput) =>
  adminRequest<IngredientDetail>(`/api/admin/ingredients/${encodeURIComponent(id)}/prices/${encodeURIComponent(priceId)}`, token, { method: "PUT", body: JSON.stringify(input) });
export const deleteIngredientPrice = (token: string | null, id: string, priceId: string) =>
  adminRequest<IngredientDetail>(`/api/admin/ingredients/${encodeURIComponent(id)}/prices/${encodeURIComponent(priceId)}`, token, { method: "DELETE" });

export const listRecipes = (token: string | null) => adminRequest<{ recipes: Recipe[] }>("/api/admin/recipes", token);
export const getRecipe = (token: string | null, id: string) => adminRequest<Recipe>(`/api/admin/recipes/${encodeURIComponent(id)}`, token);
export const createRecipe = (token: string | null, input: RecipeInput) =>
  adminRequest<Recipe>("/api/admin/recipes", token, { method: "POST", body: JSON.stringify(input) });
export const saveRecipe = (token: string | null, id: string, input: RecipeInput) =>
  adminRequest<Recipe>(`/api/admin/recipes/${encodeURIComponent(id)}`, token, { method: "PUT", body: JSON.stringify(input) });
export const deleteRecipe = (token: string | null, id: string) =>
  adminRequest<void>(`/api/admin/recipes/${encodeURIComponent(id)}`, token, { method: "DELETE" });

/* ---------- Unidades ---------- */

export const BASE_UNIT_LABELS: Record<BaseUnit, string> = { GRAM: "Gramos", MILLILITER: "Mililitros", UNIT: "Unidades" };

/** Sufijo del costo: "$ 29,32 / g". */
export const BASE_UNIT_SHORT: Record<BaseUnit, string> = { GRAM: "g", MILLILITER: "ml", UNIT: "unidad" };

export const MEASURE_LABELS: Record<MeasureUnit, string> = { G: "g", KG: "kg", ML: "ml", L: "litros", UNIT: "unidades", PACKAGE: "paquetes" };


export const RECIPE_UNITS: Record<BaseUnit, MeasureUnit[]> = { GRAM: ["G", "KG"], MILLILITER: ["ML", "L"], UNIT: ["UNIT"] };

const FACTOR: Record<MeasureUnit, number> = { G: 1, KG: 1000, ML: 1, L: 1000, UNIT: 1, PACKAGE: 1 };

/** Cantidad en unidad base (para mostrar mientras se edita). */
export const toBase = (quantity: number, unit: MeasureUnit, unitsPerPackage = 1) => quantity * FACTOR[unit] * (unit === "PACKAGE" ? unitsPerPackage : 1);

/* ---------- Números (formato argentino) ---------- */

/**
 * Lo que escribe la persona → número. Acepta "1,25", "1.25", "87.964",
 * "87964" y "6.333,30". Con coma: la coma es el decimal y los puntos son miles.
 * Sin coma: "87.964" (grupos de 3) son miles; "1.5" es decimal.
 */
export function parseAmount(text: string): number | null {
  let t = text.trim().replace(/\s|\$/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Número → string para la API ("1.25"), con los decimales que acepta el backend. */
export const toApiNumber = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));

const moneyFormat = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const smallMoneyFormat = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const quantityFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });

/** "$ 2.576,09". */
export const formatMoney = (value: string | number) => moneyFormat.format(Number(value));

/** Costo por unidad base: "$ 29,32 / g". Menos de $1: hasta 4 decimales ("$ 0,0137 / g"). */
export function formatUnitCost(value: string | number, baseUnit: BaseUnit) {
  const n = Number(value);
  return `${(n < 1 ? smallMoneyFormat : moneyFormat).format(n)} / ${BASE_UNIT_SHORT[baseUnit]}`;
}

/** "1,25 g" · "350 g" · "2 unidades" · "1 unidad". */
export function formatQuantity(value: string | number, unit: MeasureUnit) {
  const n = Number(value);
  const label = unit === "UNIT" && n === 1 ? "unidad" : unit === "PACKAGE" && n === 1 ? "paquete" : MEASURE_LABELS[unit];
  return `${quantityFormat.format(n)} ${label}`;
}

/**
 * Una compra tal como se cargó (la conversión a g/ml es interna):
 * "2,5 kg", "1.000 g", "0,75 litros", "1 litro", "30 unidades".
 */
export function formatPurchase(p: { purchaseQuantity: string; purchaseUnit: MeasureUnit; unitsPerPackage: string | null }) {
  const n = Number(p.purchaseQuantity);
  if (p.purchaseUnit === "L") return `${quantityFormat.format(n)} ${n === 1 ? "litro" : "litros"}`;
  if (p.purchaseUnit === "PACKAGE" && p.unitsPerPackage) return `${formatQuantity(n, "PACKAGE")} × ${formatQuantity(p.unitsPerPackage, "UNIT")}`;
  return formatQuantity(n, p.purchaseUnit);
}

export const formatBaseQuantity = (value: string | number, baseUnit: BaseUnit) =>
  formatQuantity(value, baseUnit === "GRAM" ? "G" : baseUnit === "MILLILITER" ? "ML" : "UNIT");

/** "2026-10-02" → "02/10/2026". */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** Hoy en Argentina (YYYY-MM-DD), para la fecha de compra por defecto. */
export const todayAR = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/* ---------- Simulador de producción (solo calcula en el servidor, con Decimal; no guarda) ---------- */

export type SimulationResult = {
  recipes: {
    recipeId: string;
    name: string;
    status: RecipeStatus;
    cookies: number;
    yieldQuantity: number;
    /** Equivalencia en recetas ("2", "1.5"). */
    factor: string;
    baseCost: string | null;
    /** Costo de cada parte para estas cookies. */
    components: Record<RecipeComponent, PartCost>;
    missingPrices: number;
    ingredientsCost: string;
    extrasCost: string;
    knownCost: string;
    totalCost: string | null;
    costPerCookie: string | null;
  }[];
  /** Ingredientes agrupados por parte + ingrediente (masa, relleno; alfabético). */
  ingredients: {
    ingredientId: string;
    name: string;
    baseUnit: BaseUnit;
    component: RecipeComponent;
    /** Cantidad necesaria en unidad base (g, ml o unidades). */
    quantity: string;
    unitCost: string | null;
    cost: string | null;
    /** Por variedad: cantidad y costo de este ingrediente para cada receta. */
    byRecipe: { recipeId: string; quantity: string; cost: string | null }[];
  }[];
  summary: {
    totalCookies: number;
    hasDraft: boolean;
    complete: boolean;
    missingPrices: number;
    /** Costo de masa / relleno / sin clasificar de toda la producción. */
    components: Record<RecipeComponent, PartCost>;
    ingredientsCost: string;
    extrasCost: string;
    knownCost: string;
    totalCost: string | null;
    averagePerCookie: string | null;
  };
};

export const simulateProduction = (token: string | null, items: { recipeId: string; cookies: number }[]) =>
  adminRequest<SimulationResult>("/api/admin/production/simulate", token, { method: "POST", body: JSON.stringify({ items }) });

const factorFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** "2 recetas" · "1,5 recetas" · "1 receta" · "≈ 1,33 recetas". */
export function formatFactor(factor: string) {
  const n = Number(factor);
  const shown = factorFormat.format(n);
  const approx = Number(shown.replace(/\./g, "").replace(",", ".")) !== n ? "≈ " : "";
  return `${approx}${shown} ${n === 1 ? "receta" : "recetas"}`;
}

const bigFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/**
 * Cantidad cómoda: desde 1000 g / 1000 ml se muestra en kg / l con el detalle:
 * "1,18 kg (1.180 g)" · "1,5 l (1.500 ml)" · "8 unidades".
 */
export function formatNeeded(quantity: string, baseUnit: BaseUnit) {
  const n = Number(quantity);
  const base = formatBaseQuantity(quantity, baseUnit);
  if (baseUnit === "GRAM" && n >= 1000) return `${bigFormat.format(n / 1000)} kg (${base})`;
  if (baseUnit === "MILLILITER" && n >= 1000) return `${bigFormat.format(n / 1000)} l (${base})`;
  return base;
}
