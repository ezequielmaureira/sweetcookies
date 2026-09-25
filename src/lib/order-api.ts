import { apiUrl, fetchWithTimeout } from "@/lib/api";
import type { CustomerDetails } from "@/lib/order";

/** Comprobante que devuelve el servidor: precios y total calculados en la base. */
export type OrderReceipt = {
  id: string;
  number: number;
  total: string;
  itemCount: number;
  items: { name: string; quantity: number; unitPrice: string; subtotal: string }[];
};

export type OrderProblem = { productId: string; name: string | null; reason: "not_found" | "unavailable" | "insufficient_stock"; available: number };

export type CreateOrderResult =
  | { ok: true; order: OrderReceipt; whatsappNumber: string }
  | { ok: false; kind: "items"; problems: OrderProblem[] }
  | { ok: false; kind: "validation"; fields: Record<string, string> }
  | { ok: false; kind: "paused" | "no-whatsapp" | "rate-limit" | "network" | "unknown" };

/**
 * POST /api/orders. Solo se envían productos, cantidades y datos del cliente:
 * el servidor busca precios/costos reales, valida stock, guarda el pedido con
 * snapshots y descuenta stock en una transacción.
 */
export async function createOrder(items: { productId: string; quantity: number }[], customer: CustomerDetails): Promise<CreateOrderResult> {
  const url = apiUrl("/api/orders");
  if (!url) return { ok: false, kind: "network" };
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        customer: {
          name: customer.name,
          lastName: customer.lastName,
          phone: customer.phone,
          email: customer.email,
          deliveryMethod: customer.method === "envio" ? "DELIVERY" : "PICKUP",
          address: customer.method === "envio" ? customer.address : "",
          notes: customer.notes,
        },
      }),
      // El backend puede estar despertando (Fly): margen generoso.
      timeoutMs: 20000,
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 201 && body.order && typeof body.whatsappNumber === "string") {
    return { ok: true, order: body.order as OrderReceipt, whatsappNumber: body.whatsappNumber };
  }
  if (res.status === 409 && body.error === "items_unavailable") return { ok: false, kind: "items", problems: (body.problems as OrderProblem[]) ?? [] };
  if (res.status === 409 && body.error === "orders_paused") return { ok: false, kind: "paused" };
  if (res.status === 409 && body.error === "whatsapp_not_configured") return { ok: false, kind: "no-whatsapp" };
  if (res.status === 422) return { ok: false, kind: "validation", fields: (body.fields as Record<string, string>) ?? {} };
  if (res.status === 429) return { ok: false, kind: "rate-limit" };
  return { ok: false, kind: "unknown" };
}
