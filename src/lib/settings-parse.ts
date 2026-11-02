import { normalizeWhatsAppNumber } from "./whatsapp.ts";

/** Configuración pública que devuelve GET /api/public/settings. */
export type PublicSettings = {
  whatsappNumber: string | null;
  instagramHandle: string | null;
  /** Interruptor maestro "Pedidos activos": false = se ve el catálogo, pero no se aceptan pedidos. */
  ordersEnabled: boolean;
  /** Mensaje opcional del negocio mientras los pedidos están pausados. */
  ordersDisabledMessage: string | null;
  /** Interruptor maestro "Modo mantenimiento". true = se muestra la pantalla de mantenimiento. */
  maintenanceEnabled: boolean;
  /** Frase principal de la pantalla de mantenimiento. null = texto por defecto. */
  maintenanceTitle: string | null;
  /** Subfrase de la pantalla de mantenimiento. null = texto por defecto. */
  maintenanceSubtitle: string | null;
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
  // Si falta o es inválido, se interpreta "sin mantenimiento" (nunca se cierra la tienda por un dato raro).
  const maintenanceEnabled = typeof raw.maintenanceEnabled === "boolean" ? raw.maintenanceEnabled : false;
  const title = typeof raw.maintenanceTitle === "string" ? raw.maintenanceTitle.trim().slice(0, 80) : "";
  const subtitle = typeof raw.maintenanceSubtitle === "string" ? raw.maintenanceSubtitle.trim().slice(0, 160) : "";
  return {
    whatsappNumber: typeof raw.whatsappNumber === "string" ? normalizeWhatsAppNumber(raw.whatsappNumber) : null,
    instagramHandle:
      typeof raw.instagramHandle === "string" && INSTAGRAM_HANDLE.test(raw.instagramHandle) ? raw.instagramHandle : null,
    ordersEnabled,
    ordersDisabledMessage: message || null,
    maintenanceEnabled,
    maintenanceTitle: title || null,
    maintenanceSubtitle: subtitle || null,
  };
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}
