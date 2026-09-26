import { adminRequest } from "@/lib/admin/admin-api";

export { AdminApiError } from "@/lib/admin/admin-api";

export type AdminSettings = {
  /** Teléfono / WhatsApp de pedidos del negocio (solo dígitos, con código de país). */
  whatsappNumber: string | null;
  instagramHandle: string | null;
  /** Interruptor maestro "Pedidos activos". */
  ordersEnabled: boolean;
  /** Mensaje opcional para el comprador mientras los pedidos están pausados. */
  ordersDisabledMessage: string | null;
  updatedAt: string | null;
};

/** Formulario de Configuración (el interruptor de pedidos se guarda aparte, al instante). */
export type SettingsInput = {
  whatsappNumber: string;
  instagramHandle: string;
};

export type FieldErrors = Partial<Record<keyof SettingsInput | "ordersDisabledMessage", string>>;

export type OrdersPatch = { ordersEnabled?: boolean; ordersDisabledMessage?: string | null };

export const getAdminSettings = (token: string | null) => adminRequest<AdminSettings>("/api/admin/settings", token);

export const saveAdminSettings = (token: string | null, input: SettingsInput) =>
  adminRequest<AdminSettings>("/api/admin/settings", token, { method: "PUT", body: JSON.stringify(input) });

/** Interruptor "Pedidos activos" y su mensaje: PATCH parcial, no toca el resto de la configuración. */
export const saveOrdersStatus = (token: string | null, patch: OrdersPatch) =>
  adminRequest<AdminSettings>("/api/admin/settings/orders", token, { method: "PATCH", body: JSON.stringify(patch) });
