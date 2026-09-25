/**
 * Productos: tipos, validación y vistas pública/admin (lógica pura).
 */
import { centsToDecimalString, parseMoney } from "./money.ts";

export type ProductStatus = "ACTIVE" | "PAUSED";
/** Estado que ve el admin. OUT_OF_STOCK es calculado (ACTIVE con stock 0), no se guarda. */
export type DisplayStatus = ProductStatus | "OUT_OF_STOCK";

/** Producto tal como lo maneja el servidor (dinero en centavos). */
export type ProductRecord = {
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
export type PublicProduct = {
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

export type ProductData = {
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
  };
}
