/**
 * Pedidos: validación, cálculo con snapshots y filtros del admin (lógica pura).
 *
 * El cliente solo manda qué productos y cuántos; precios, costos, subtotales,
 * total y ganancia se calculan SIEMPRE acá con los datos de la base.
 */
import { centsToDecimalString } from "./money.ts";
import { isPurchasable, type ProductRecord } from "./products.ts";

export type DeliveryMethod = "PICKUP" | "DELIVERY";
export type OrderStatus = "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED";

export const ORDER_LIMITS = {
  maxLines: 30,
  maxQuantity: 99,
  name: 80,
  lastName: 80,
  phone: 30,
  email: 120,
  address: 200,
  notes: 600,
} as const;

export type OrderRequestItem = { productId: string; quantity: number };

export type CustomerData = {
  name: string;
  lastName: string | null;
  /** Solo dígitos. */
  phone: string | null;
  email: string | null;
  deliveryMethod: DeliveryMethod;
  address: string | null;
  notes: string | null;
};

export type OrderRequest = { items: OrderRequestItem[]; customer: CustomerData };

export type OrderInputErrors = Partial<Record<"items" | "name" | "lastName" | "phone" | "email" | "deliveryMethod" | "address" | "notes" | "body", string>>;

const oneLine = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

function multiLine(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida el body de POST /api/orders. Las cantidades del mismo producto se suman. */
export function validateOrderRequest(body: unknown): { ok: true; data: OrderRequest } | { ok: false; errors: OrderInputErrors } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: { body: "Body inválido." } };
  const input = body as { items?: unknown; customer?: unknown };
  const errors: OrderInputErrors = {};

  const merged = new Map<string, number>();
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.items = "El pedido está vacío.";
  } else if (input.items.length > ORDER_LIMITS.maxLines) {
    errors.items = "Demasiados productos en un pedido.";
  } else {
    for (const raw of input.items) {
      const item = raw as { productId?: unknown; quantity?: unknown };
      const id = typeof item?.productId === "string" ? item.productId.trim() : "";
      const qty = item?.quantity;
      if (!id || id.length > 40 || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > ORDER_LIMITS.maxQuantity) {
        errors.items = "Hay productos o cantidades inválidas.";
        break;
      }
      merged.set(id, (merged.get(id) ?? 0) + qty);
    }
    if (!errors.items && [...merged.values()].some((q) => q > ORDER_LIMITS.maxQuantity)) {
      errors.items = `Máximo ${ORDER_LIMITS.maxQuantity} unidades por producto.`;
    }
  }

  const c = (input.customer && typeof input.customer === "object" ? input.customer : {}) as Record<string, unknown>;
  const name = oneLine(c.name);
  const lastName = oneLine(c.lastName);
  const phoneRaw = oneLine(c.phone);
  const phone = phoneRaw.replace(/\D/g, "");
  const email = oneLine(c.email).toLowerCase();
  const address = oneLine(c.address);
  const notes = multiLine(c.notes);
  const deliveryMethod = c.deliveryMethod === "PICKUP" || c.deliveryMethod === "DELIVERY" ? c.deliveryMethod : null;

  if (!name) errors.name = "Contanos tu nombre.";
  else if (name.length > ORDER_LIMITS.name) errors.name = "Nombre demasiado largo.";
  if (lastName.length > ORDER_LIMITS.lastName) errors.lastName = "Apellido demasiado largo.";
  if (phoneRaw.length > ORDER_LIMITS.phone || (phoneRaw && (phone.length < 6 || phone.length > 20))) errors.phone = "Teléfono inválido.";
  if (email && (email.length > ORDER_LIMITS.email || !EMAIL.test(email))) errors.email = "Email inválido.";
  if (!deliveryMethod) errors.deliveryMethod = "Elegí retiro o envío.";
  if (deliveryMethod === "DELIVERY" && !address) errors.address = "Indicá la dirección de entrega.";
  if (address.length > ORDER_LIMITS.address) errors.address = "Dirección demasiado larga.";
  if (notes.length > ORDER_LIMITS.notes) errors.notes = "Observaciones demasiado largas.";

  if (Object.keys(errors).length > 0 || !deliveryMethod) return { ok: false, errors };
  return {
    ok: true,
    data: {
      items: [...merged].map(([productId, quantity]) => ({ productId, quantity })),
      customer: {
        name,
        lastName: lastName || null,
        phone: phone || null,
        email: email || null,
        deliveryMethod,
        address: deliveryMethod === "DELIVERY" ? address : null,
        notes: notes || null,
      },
    },
  };
}

/* ---------- Cálculo ---------- */

export type PricedLine = {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  subtotalCents: number;
  profitCents: number;
};

export type PricedOrder = { lines: PricedLine[]; totalCents: number; profitCents: number; itemCount: number };

export type OrderProblem = { productId: string; name: string | null; reason: "not_found" | "unavailable" | "insufficient_stock"; available: number };

export type OrderErrorCode = "invalid_items" | "orders_paused" | "whatsapp_not_configured";

export class OrderError extends Error {
  readonly code: OrderErrorCode;
  readonly problems: OrderProblem[];

  constructor(code: OrderErrorCode, problems: OrderProblem[] = []) {
    super(code);
    this.code = code;
    this.problems = problems;
  }
}

/**
 * Snapshot + cálculo con los datos REALES de la base:
 * subtotal = precio × cantidad · ganancia = (precio − costo) × cantidad.
 * Si algún producto no existe, no está disponible o no alcanza el stock,
 * se rechaza todo el pedido (nunca parcial).
 */
export function priceOrder(items: OrderRequestItem[], products: ProductRecord[]): PricedOrder {
  const byId = new Map(products.map((p) => [p.id, p]));
  const problems: OrderProblem[] = [];
  const lines: PricedLine[] = [];

  for (const { productId, quantity } of items) {
    const product = byId.get(productId);
    if (!product) {
      problems.push({ productId, name: null, reason: "not_found", available: 0 });
      continue;
    }
    if (!isPurchasable(product)) {
      problems.push({ productId, name: product.name, reason: "unavailable", available: 0 });
      continue;
    }
    if (product.stock < quantity) {
      problems.push({ productId, name: product.name, reason: "insufficient_stock", available: product.stock });
      continue;
    }
    lines.push({
      productId,
      productNameSnapshot: product.name,
      quantity,
      unitPriceCents: product.priceCents,
      unitCostCents: product.costCents,
      subtotalCents: product.priceCents * quantity,
      profitCents: (product.priceCents - product.costCents) * quantity,
    });
  }

  if (problems.length > 0) throw new OrderError("invalid_items", problems);
  return {
    lines,
    totalCents: lines.reduce((sum, l) => sum + l.subtotalCents, 0),
    profitCents: lines.reduce((sum, l) => sum + l.profitCents, 0),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

export function customerSortKey(name: string, lastName: string | null): string {
  return `${name} ${lastName ?? ""}`.trim().toLocaleLowerCase("es").slice(0, 170);
}

/* ---------- Respuestas ---------- */

/** Lo que recibe el comprador al confirmar: sin costo ni ganancia. */
export type PublicOrderReceipt = {
  id: string;
  number: number;
  total: string;
  itemCount: number;
  items: { name: string; quantity: number; unitPrice: string; subtotal: string }[];
};

export function toReceipt(order: { id: string; number: number; itemCount: number }, priced: PricedOrder): PublicOrderReceipt {
  return {
    id: order.id,
    number: order.number,
    total: centsToDecimalString(priced.totalCents),
    itemCount: priced.itemCount,
    items: priced.lines.map((l) => ({
      name: l.productNameSnapshot,
      quantity: l.quantity,
      unitPrice: centsToDecimalString(l.unitPriceCents),
      subtotal: centsToDecimalString(l.subtotalCents),
    })),
  };
}

/* ---------- Filtros del admin ---------- */

export const ORDER_SORTS = {
  recent: "Más recientes",
  oldest: "Más antiguos",
  total_desc: "Mayor importe",
  total_asc: "Menor importe",
  profit_desc: "Mayor ganancia",
  profit_asc: "Menor ganancia",
  customer_asc: "Cliente A-Z",
  customer_desc: "Cliente Z-A",
} as const;

export type OrderSort = keyof typeof ORDER_SORTS;

export type OrderListQuery = {
  q: string | null;
  /** Inicio inclusivo (medianoche de Argentina). */
  from: Date | null;
  /** Fin exclusivo (medianoche del día siguiente, Argentina). */
  to: Date | null;
  sort: OrderSort;
  page: number;
  pageSize: number;
};

/** Las fechas del filtro son días de Argentina (UTC−3, sin horario de verano). */
const AR_OFFSET = "-03:00";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayStart(value: string): Date | null {
  if (!DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00${AR_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseOrderListQuery(params: URLSearchParams): OrderListQuery {
  const sortParam = params.get("sort") ?? "";
  const sort = (sortParam in ORDER_SORTS ? sortParam : "recent") as OrderSort;
  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  const from = dayStart(params.get("from") ?? "");
  const toStart = dayStart(params.get("to") ?? "");
  const to = toStart ? new Date(toStart.getTime() + 24 * 60 * 60 * 1000) : null;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(params.get("pageSize") ?? "20", 10) || 20));
  return { q, from, to, sort, page, pageSize };
}

type SortDir = "asc" | "desc";
type OrderByInput = Partial<Record<"createdAt" | "total" | "profit" | "customerSortKey" | "number", SortDir>>;

/** orderBy de Prisma para cada criterio (con desempate estable por número de pedido). */
export function orderByFor(sort: OrderSort): OrderByInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { number: "asc" }];
    case "total_desc":
      return [{ total: "desc" }, { number: "desc" }];
    case "total_asc":
      return [{ total: "asc" }, { number: "desc" }];
    case "profit_desc":
      return [{ profit: "desc" }, { number: "desc" }];
    case "profit_asc":
      return [{ profit: "asc" }, { number: "desc" }];
    case "customer_asc":
      return [{ customerSortKey: "asc" }, { number: "desc" }];
    case "customer_desc":
      return [{ customerSortKey: "desc" }, { number: "desc" }];
    default:
      return [{ createdAt: "desc" }, { number: "desc" }];
  }
}

type Contains = { contains: string; mode: "insensitive" };
type SearchClause = Partial<Record<"customerName" | "customerLastName" | "customerEmail" | "customerPhone", Contains>>;

/**
 * where de Prisma: cada palabra de la búsqueda debe aparecer en nombre,
 * apellido, email o teléfono (así "Juan Pérez" encuentra nombre + apellido).
 * Si la palabra tiene dígitos, se compara contra el teléfono solo con dígitos.
 */
export function orderWhere(query: Pick<OrderListQuery, "q" | "from" | "to">) {
  const and: Record<string, unknown>[] = [];
  if (query.from || query.to) {
    and.push({ createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } });
  }
  for (const term of (query.q ?? "").split(" ").filter(Boolean)) {
    const text: Contains = { contains: term, mode: "insensitive" };
    const or: SearchClause[] = [{ customerName: text }, { customerLastName: text }, { customerEmail: text }];
    const digits = term.replace(/\D/g, "");
    if (digits.length >= 3) or.push({ customerPhone: { contains: digits, mode: "insensitive" } });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}
