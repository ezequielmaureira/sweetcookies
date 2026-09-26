import { apiUrl, fetchWithTimeout } from "@/lib/api";

/**
 * Cliente del backend para el panel: siempre con el token de sesión de Clerk
 * (Authorization: Bearer). La autorización real (ADMIN_EMAILS) la hace el
 * servidor en cada request.
 */
export class AdminApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;

  constructor(status: number, fields: Record<string, string> = {}) {
    super(`admin_api_${status}`);
    this.status = status;
    this.fields = fields;
  }
}

export async function adminRequest<T>(path: string, token: string | null, init: RequestInit & { contentType?: string } = {}): Promise<T> {
  const { contentType = "application/json", ...requestInit } = init;
  const url = apiUrl(path);
  if (!url) throw new AdminApiError(0);
  if (!token) throw new AdminApiError(401);
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      ...requestInit,
      cache: "no-store",
      headers: { ...requestInit.headers, Authorization: `Bearer ${token}`, "Content-Type": contentType },
      timeoutMs: 30000,
    });
  } catch {
    throw new AdminApiError(0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(res.status, (body as { fields?: Record<string, string> }).fields ?? {});
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Mensaje en castellano para cada error típico del panel. */
export function adminErrorMessage(error: unknown, fallback = "No pudimos completar la acción."): string {
  if (!(error instanceof AdminApiError)) return fallback;
  if (error.status === 401 || error.status === 403) return "Tu sesión no tiene permisos. Volvé a ingresar.";
  if (error.status === 404) return "Ya no existe (quizás se eliminó en otra pestaña).";
  if (error.status === 422) return "Revisá los campos marcados.";
  if (error.status === 0) return "No hay conexión con el servidor. Probá de nuevo en unos segundos.";
  return fallback;
}

/* ---------- Productos ---------- */

export type ProductStatus = "ACTIVE" | "PAUSED";
export type DisplayStatus = ProductStatus | "OUT_OF_STOCK";

/** Vista en caja: imagen específica opcional + encuadre (ver src/lib/box-view.ts). */
export type BoxViewInput = {
  boxImageUrl: string | null;
  boxImageScale: number;
  boxImageX: number;
  boxImageY: number;
  boxImageRotation: number;
};

export type AdminProduct = BoxViewInput & {
  id: string;
  name: string;
  description: string | null;
  price: string;
  cost: string;
  unitProfit: string;
  stock: number;
  imageUrl: string | null;
  category: string | null;
  status: ProductStatus;
  displayStatus: DisplayStatus;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = BoxViewInput & {
  name: string;
  description: string;
  price: string;
  cost: string;
  stock: number;
  imageUrl: string;
  category: string;
  status: ProductStatus;
  featured: boolean;
};

export const listProducts = async (token: string | null) =>
  (await adminRequest<{ products: AdminProduct[] }>("/api/admin/products", token)).products;

export const getProduct = (token: string | null, id: string) =>
  adminRequest<AdminProduct>(`/api/admin/products/${encodeURIComponent(id)}`, token);

export const createProduct = (token: string | null, input: ProductInput) =>
  adminRequest<AdminProduct>("/api/admin/products", token, { method: "POST", body: JSON.stringify(input) });

export const updateProduct = (token: string | null, id: string, patch: Partial<ProductInput>) =>
  adminRequest<AdminProduct>(`/api/admin/products/${encodeURIComponent(id)}`, token, { method: "PATCH", body: JSON.stringify(patch) });

export const duplicateProduct = (token: string | null, id: string) =>
  adminRequest<AdminProduct>(`/api/admin/products/${encodeURIComponent(id)}/duplicate`, token, { method: "POST" });

export const deleteProduct = (token: string | null, id: string) =>
  adminRequest<void>(`/api/admin/products/${encodeURIComponent(id)}`, token, { method: "DELETE" });

/* ---------- Imágenes ---------- */

/** Sube una imagen (ya reducida en el navegador). Devuelve la ruta a guardar en imageUrl / boxImageUrl. */
export const uploadImage = (token: string | null, file: Blob) =>
  adminRequest<{ url: string; width: number | null; height: number | null }>("/api/admin/images", token, {
    method: "POST",
    body: file,
    contentType: file.type,
  });

/* ---------- Pedidos ---------- */

export type OrderStatus = "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED";

export type AdminOrderRow = {
  id: string;
  number: number;
  createdAt: string;
  customerName: string;
  customerLastName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryMethod: "PICKUP" | "DELIVERY";
  itemCount: number;
  total: string;
  profit: string;
  status: OrderStatus;
};

export type AdminOrderDetail = AdminOrderRow & {
  deliveryAddress: string | null;
  notes: string | null;
  items: { productId: string | null; productName: string; quantity: number; unitPrice: string; unitCost: string; subtotal: string; profit: string }[];
};

export type OrderSort = "recent" | "oldest" | "total_desc" | "total_asc" | "profit_desc" | "profit_asc" | "customer_asc" | "customer_desc";

export const ORDER_SORT_LABELS: Record<OrderSort, string> = {
  recent: "Más recientes",
  oldest: "Más antiguos",
  total_desc: "Mayor importe",
  total_asc: "Menor importe",
  profit_desc: "Mayor ganancia",
  profit_asc: "Menor ganancia",
  customer_asc: "Cliente A-Z",
  customer_desc: "Cliente Z-A",
};

export type OrderFilters = { q: string; from: string; to: string; sort: OrderSort; page: number };

export type AdminOrderList = {
  summary: { orders: number; revenue: string; profit: string; items: number };
  orders: AdminOrderRow[];
  page: number;
  pageSize: number;
  totalPages: number;
};

export function orderQueryString(filters: OrderFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sort !== "recent") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}

export const listOrders = (token: string | null, filters: OrderFilters) =>
  adminRequest<AdminOrderList>(`/api/admin/orders?${orderQueryString(filters)}`, token);

export const getOrder = (token: string | null, id: string) =>
  adminRequest<AdminOrderDetail>(`/api/admin/orders/${encodeURIComponent(id)}`, token);
