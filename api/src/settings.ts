/**
 * Configuración global del sitio: tipos, valores por defecto y validación.
 * Lógica pura (sin DB ni HTTP) para poder testearla.
 */

export type SiteSettingsData = {
  whatsappNumber: string | null;
  instagramHandle: string | null;
  whatsappOrdersEnabled: boolean;
};

/** Datos que puede ver cualquiera (la web pública). */
export type PublicSettings = SiteSettingsData;

/** Datos del panel admin (incluye auditoría mínima). */
export type AdminSettings = SiteSettingsData & { updatedAt: string | null };

export const SETTINGS_ID = "global";

/** Estado inicial si todavía no existe el registro: sin número (no se inventa ninguno). */
export const DEFAULT_SETTINGS: SiteSettingsData = {
  whatsappNumber: null,
  instagramHandle: null,
  whatsappOrdersEnabled: true,
};

/** Solo dígitos, con código de país. 8 a 15 dígitos (E.164), sin 0 inicial. */
export function normalizeWhatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return digits;
}

/** Usuario de Instagram: letras, números, punto y guion bajo (máx. 30). Se guarda con "@". */
export function normalizeInstagramHandle(raw: string): string | null {
  let value = raw.trim();
  const fromUrl = value.match(/instagram\.com\/([^/?#]+)/i);
  if (fromUrl) value = fromUrl[1];
  value = value.replace(/^@+/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(value)) return null;
  return `@${value.toLowerCase()}`;
}

export type SettingsField = keyof SiteSettingsData;
export type ValidationResult =
  | { ok: true; data: SiteSettingsData }
  | { ok: false; errors: Partial<Record<SettingsField | "body", string>> };

/**
 * Valida el body de PUT /api/admin/settings.
 * - whatsappNumber: string (se normaliza) o null/"" para dejarlo sin configurar.
 * - instagramHandle: string (se normaliza) o null/"" para no mostrarlo.
 * - whatsappOrdersEnabled: boolean.
 * Campos desconocidos se ignoran.
 */
export function validateSettingsInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: { body: "Body inválido." } };
  }
  const input = body as Record<string, unknown>;
  const errors: Partial<Record<SettingsField | "body", string>> = {};

  let whatsappNumber: string | null = null;
  if (typeof input.whatsappNumber === "string" && input.whatsappNumber.trim() !== "") {
    if (input.whatsappNumber.length > 40) errors.whatsappNumber = "Número inválido.";
    else {
      whatsappNumber = normalizeWhatsAppNumber(input.whatsappNumber);
      if (!whatsappNumber) errors.whatsappNumber = "Ingresá entre 8 y 15 dígitos, con código de país.";
    }
  } else if (input.whatsappNumber !== null && input.whatsappNumber !== undefined && input.whatsappNumber !== "") {
    errors.whatsappNumber = "Número inválido.";
  }

  let instagramHandle: string | null = null;
  if (typeof input.instagramHandle === "string" && input.instagramHandle.trim() !== "") {
    if (input.instagramHandle.length > 120) errors.instagramHandle = "Usuario inválido.";
    else {
      instagramHandle = normalizeInstagramHandle(input.instagramHandle);
      if (!instagramHandle) errors.instagramHandle = "Usá solo letras, números, puntos y guiones bajos.";
    }
  } else if (input.instagramHandle !== null && input.instagramHandle !== undefined && input.instagramHandle !== "") {
    errors.instagramHandle = "Usuario inválido.";
  }

  if (typeof input.whatsappOrdersEnabled !== "boolean") {
    errors.whatsappOrdersEnabled = "Valor inválido.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { whatsappNumber, instagramHandle, whatsappOrdersEnabled: input.whatsappOrdersEnabled as boolean },
  };
}
