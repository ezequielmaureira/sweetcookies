/**
 * Productos: tipos, validación y vistas pública/admin (lógica pura).
 */
import { centsToDecimalString, parseMoney } from "./money.ts";

export type ProductStatus = "ACTIVE" | "PAUSED";
/** Estado que ve el admin. OUT_OF_STOCK es calculado (ACTIVE con stock 0), no se guarda. */
export type DisplayStatus = ProductStatus | "OUT_OF_STOCK";

/**
 * Vista en caja. Prioridad: boxImageUrl (imagen específica, opcional) →
 * si no hay, imageUrl encuadrada. El encuadre (zoom, punto central y
 * rotación) se aplica a la imagen que se use.
 */
export type BoxView = {
  boxImageUrl: string | null;
  /** 1 a 4. */
  boxImageScale: number;
  /** Punto de la foto que queda al centro de la cookie, 0–100 %. */
  boxImageX: number;
  boxImageY: number;
  /** Grados, −180 a 180. */
  boxImageRotation: number;
};

export const BOX_LIMITS = { minScale: 1, maxScale: 4, minRotation: -180, maxRotation: 180 } as const;

export const DEFAULT_BOX_VIEW: BoxView = { boxImageUrl: null, boxImageScale: 1, boxImageX: 50, boxImageY: 50, boxImageRotation: 0 };

/** Producto tal como lo maneja el servidor (dinero en centavos). */
export type ProductRecord = BoxView & {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  costCents: number;
  stock: number;
  imageUrl: string | null;
  category: string | null;
  status: ProductStatus;
  featured: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Lo único que ve el comprador: nunca costo ni ganancia. */
export type PublicProduct = BoxView & {
  id: string;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  imageUrl: string | null;
  category: string | null;
  featured: boolean;
};

export type AdminProduct = PublicProduct & {
  cost: string;
  /** Ganancia por unidad (precio − costo). */
  unitProfit: string;
  status: ProductStatus;
  displayStatus: DisplayStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const PRODUCT_LIMITS = { name: 80, description: 400, category: 40, imageUrl: 500, maxStock: 100_000 } as const;

export function displayStatus(product: Pick<ProductRecord, "status" | "stock">): DisplayStatus {
  if (product.status === "PAUSED") return "PAUSED";
  return product.stock > 0 ? "ACTIVE" : "OUT_OF_STOCK";
}

/**
 * ¿Se puede comprar? ACTIVE, con stock y con precio cargado. El precio > 0
 * evita vender por $0 un producto recién creado o importado sin precio.
 */
export function isPurchasable(product: Pick<ProductRecord, "status" | "stock" | "priceCents">): boolean {
  return product.status === "ACTIVE" && product.stock > 0 && product.priceCents > 0;
}

export function toPublicProduct(p: ProductRecord): PublicProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: centsToDecimalString(p.priceCents),
    stock: p.stock,
    imageUrl: p.imageUrl,
    category: p.category,
    featured: p.featured,
    boxImageUrl: p.boxImageUrl,
    boxImageScale: p.boxImageScale,
    boxImageX: p.boxImageX,
    boxImageY: p.boxImageY,
    boxImageRotation: p.boxImageRotation,
  };
}

export function toAdminProduct(p: ProductRecord): AdminProduct {
  return {
    ...toPublicProduct(p),
    cost: centsToDecimalString(p.costCents),
    unitProfit: centsToDecimalString(p.priceCents - p.costCents),
    status: p.status,
    displayStatus: displayStatus(p),
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Destacados primero; después el orden del catálogo (y antigüedad como desempate). */
export function compareCatalogOrder(a: ProductRecord, b: ProductRecord): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/* ---------- Validación de entrada (admin) ---------- */

export type ProductData = BoxView & {
  name: string;
  description: string | null;
  priceCents: number;
  costCents: number;
  stock: number;
  imageUrl: string | null;
  category: string | null;
  status: ProductStatus;
  featured: boolean;
};

export type ProductField = keyof Omit<ProductData, "priceCents" | "costCents"> | "price" | "cost";
export type ProductErrors = Partial<Record<ProductField | "body", string>>;
export type ProductValidation<T> = { ok: true; data: T } | { ok: false; errors: ProductErrors };

function optionalText(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > max) return { ok: false };
  return { ok: true, value: text || null };
}

/** Ruta local del sitio (/images/...) o URL https. Nada de javascript:, data:, http:. */
export function normalizeImageUrl(value: string): string | null {
  const text = value.trim();
  if (text.length > PRODUCT_LIMITS.imageUrl) return null;
  if (/^\/(?!\/)[\w\-./%]+$/.test(text) && !text.includes("..")) return text;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Valida el body de creación (partial = false) o edición parcial (partial = true).
 * En edición solo se validan y devuelven los campos presentes.
 */
export function validateProductInput(body: unknown, partial: false): ProductValidation<ProductData>;
export function validateProductInput(body: unknown, partial: true): ProductValidation<Partial<ProductData>>;
export function validateProductInput(body: unknown, partial: boolean): ProductValidation<Partial<ProductData>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: { body: "Body inválido." } };
  const input = body as Record<string, unknown>;
  const errors: ProductErrors = {};
  const data: Partial<ProductData> = {};
  const has = (key: string) => key in input && input[key] !== undefined;

  if (has("name") || !partial) {
    const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
    if (!name) errors.name = "Ingresá un nombre.";
    else if (name.length > PRODUCT_LIMITS.name) errors.name = `Máximo ${PRODUCT_LIMITS.name} caracteres.`;
    else data.name = name;
  }

  if (has("description")) {
    const r = optionalText(input.description, PRODUCT_LIMITS.description);
    if (r.ok) data.description = r.value;
    else errors.description = `Máximo ${PRODUCT_LIMITS.description} caracteres.`;
  } else if (!partial) data.description = null;

  if (has("category")) {
    const r = optionalText(input.category, PRODUCT_LIMITS.category);
    if (r.ok) data.category = r.value;
    else errors.category = `Máximo ${PRODUCT_LIMITS.category} caracteres.`;
  } else if (!partial) data.category = null;

  for (const field of ["price", "cost"] as const) {
    if (has(field) || !partial) {
      const cents = parseMoney(input[field]);
      if (cents === null) errors[field] = "Ingresá un importe válido (ej. 5000 o 5000.50).";
      else data[field === "price" ? "priceCents" : "costCents"] = cents;
    }
  }

  if (has("stock") || !partial) {
    const stock = input.stock;
    if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > PRODUCT_LIMITS.maxStock) {
      errors.stock = "El stock debe ser un número entero de 0 en adelante.";
    } else data.stock = stock;
  }

  if (has("imageUrl")) {
    if (input.imageUrl === null || input.imageUrl === "") data.imageUrl = null;
    else if (typeof input.imageUrl === "string" && normalizeImageUrl(input.imageUrl)) data.imageUrl = normalizeImageUrl(input.imageUrl);
    else errors.imageUrl = "Usá una ruta del sitio (/images/...) o una URL https.";
  } else if (!partial) data.imageUrl = null;

  if (has("status")) {
    if (input.status === "ACTIVE" || input.status === "PAUSED") data.status = input.status;
    else errors.status = "Estado inválido.";
  } else if (!partial) data.status = "ACTIVE";

  if (has("featured")) {
    if (typeof input.featured === "boolean") data.featured = input.featured;
    else errors.featured = "Valor inválido.";
  } else if (!partial) data.featured = false;

  // Vista en caja: imagen específica opcional + encuadre con rangos controlados.
  if (has("boxImageUrl")) {
    if (input.boxImageUrl === null || input.boxImageUrl === "") data.boxImageUrl = null;
    else if (typeof input.boxImageUrl === "string" && normalizeImageUrl(input.boxImageUrl)) data.boxImageUrl = normalizeImageUrl(input.boxImageUrl);
    else errors.boxImageUrl = "Usá una imagen subida, una ruta del sitio o una URL https.";
  } else if (!partial) data.boxImageUrl = null;

  const numberIn = (key: "boxImageScale" | "boxImageX" | "boxImageY" | "boxImageRotation", min: number, max: number, integer: boolean, message: string) => {
    if (!has(key)) {
      if (!partial) data[key] = DEFAULT_BOX_VIEW[key];
      return;
    }
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) errors[key] = message;
    else data[key] = integer ? value : Math.round(value * 100) / 100;
  };
  numberIn("boxImageScale", BOX_LIMITS.minScale, BOX_LIMITS.maxScale, false, "El zoom va de 1 a 4.");
  numberIn("boxImageX", 0, 100, false, "La posición horizontal va de 0 a 100.");
  numberIn("boxImageY", 0, 100, false, "La posición vertical va de 0 a 100.");
  numberIn("boxImageRotation", BOX_LIMITS.minRotation, BOX_LIMITS.maxRotation, true, "La rotación va de −180° a 180°.");

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (partial && Object.keys(data).length === 0) return { ok: false, errors: { body: "No hay cambios." } };
  return { ok: true, data };
}

/** Copia para "Duplicar": pausada y sin destacar, para no publicarla por accidente. */
export function duplicateData(p: ProductRecord): ProductData {
  const suffix = " (copia)";
  return {
    name: `${p.name.slice(0, PRODUCT_LIMITS.name - suffix.length)}${suffix}`,
    description: p.description,
    priceCents: p.priceCents,
    costCents: p.costCents,
    stock: p.stock,
    imageUrl: p.imageUrl,
    category: p.category,
    status: "PAUSED",
    featured: false,
    boxImageUrl: p.boxImageUrl,
    boxImageScale: p.boxImageScale,
    boxImageX: p.boxImageX,
    boxImageY: p.boxImageY,
    boxImageRotation: p.boxImageRotation,
  };
}
