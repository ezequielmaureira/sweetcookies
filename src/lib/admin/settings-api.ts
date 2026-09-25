import { adminRequest } from "@/lib/admin/admin-api";

export { AdminApiError } from "@/lib/admin/admin-api";

export type AdminSettings = {
  /** Teléfono / WhatsApp de pedidos del negocio (solo dígitos, con código de país). */
  whatsappNumber: string | null;
  instagramHandle: string | null;
  whatsappOrdersEnabled: boolean;
  updatedAt: string | null;
};

export type SettingsInput = {
  whatsappNumber: string;
  instagramHandle: string;
  whatsappOrdersEnabled: boolean;
};

export type FieldErrors = Partial<Record<keyof SettingsInput, string>>;

export const getAdminSettings = (token: string | null) => adminRequest<AdminSettings>("/api/admin/settings", token);

export const saveAdminSettings = (token: string | null, input: SettingsInput) =>
  adminRequest<AdminSettings>("/api/admin/settings", token, { method: "PUT", body: JSON.stringify(input) });
