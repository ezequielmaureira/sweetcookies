import { normalizeWhatsAppNumber } from "./whatsapp.ts";

/** Configuración pública que devuelve GET /api/public/settings. */
export type PublicSettings = {
  whatsappNumber: string | null;
  instagramHandle: string | null;
  whatsappOrdersEnabled: boolean;
};

const INSTAGRAM_HANDLE = /^@[a-z0-9._]{1,30}$/i;

/** Valida la respuesta de la API; cualquier dato raro se descarta (null = usar respaldo). */
export function parsePublicSettings(data: unknown): PublicSettings | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  if (typeof raw.whatsappOrdersEnabled !== "boolean") return null;
  return {
    whatsappNumber: typeof raw.whatsappNumber === "string" ? normalizeWhatsAppNumber(raw.whatsappNumber) : null,
    instagramHandle:
      typeof raw.instagramHandle === "string" && INSTAGRAM_HANDLE.test(raw.instagramHandle) ? raw.instagramHandle : null,
    whatsappOrdersEnabled: raw.whatsappOrdersEnabled,
  };
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}
