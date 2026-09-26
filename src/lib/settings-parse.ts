import { normalizeWhatsAppNumber } from "./whatsapp.ts";

/** Configuración pública que devuelve GET /api/public/settings. */
export type PublicSettings = {
  whatsappNumber: string | null;
  instagramHandle: string | null;
  /** Interruptor maestro "Pedidos activos": false = se ve el catálogo, pero no se aceptan pedidos. */
  ordersEnabled: boolean;
  /** Mensaje opcional del negocio mientras los pedidos están pausados. */
  ordersDisabledMessage: string | null;
};

const INSTAGRAM_HANDLE = /^@[a-z0-9._]{1,30}$/i;

/** Valida la respuesta de la API; cualquier dato raro se descarta (null = usar respaldo). */
export function parsePublicSettings(data: unknown): PublicSettings | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  // Nombre anterior (whatsappOrdersEnabled) aceptado para convivir con una API sin actualizar.
  const ordersEnabled = typeof raw.ordersEnabled === "boolean" ? raw.ordersEnabled : raw.whatsappOrdersEnabled;
  if (typeof ordersEnabled !== "boolean") return null;
  const message = typeof raw.ordersDisabledMessage === "string" ? raw.ordersDisabledMessage.trim().slice(0, 200) : "";
  return {
    whatsappNumber: typeof raw.whatsappNumber === "string" ? normalizeWhatsAppNumber(raw.whatsappNumber) : null,
    instagramHandle:
      typeof raw.instagramHandle === "string" && INSTAGRAM_HANDLE.test(raw.instagramHandle) ? raw.instagramHandle : null,
    ordersEnabled,
    ordersDisabledMessage: message || null,
  };
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}
