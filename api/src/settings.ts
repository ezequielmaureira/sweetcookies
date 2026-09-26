/**
 * Configuración global del sitio: tipos, valores por defecto y validación.
 * Lógica pura (sin DB ni HTTP) para poder testearla.
 */

export type SiteSettingsData = {
  whatsappNumber: string | null;
  instagramHandle: string | null;
  /** Interruptor maestro "Pedidos activos". false = catálogo visible, sin pedidos nuevos. */
  ordersEnabled: boolean;
  /** Mensaje opcional para el comprador mientras los pedidos están pausados. */
  ordersDisabledMessage: string | null;
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
  ordersEnabled: true,
  ordersDisabledMessage: null,
};

export const ORDERS_MESSAGE_MAX = 200;

/** Nombre anterior del interruptor (se acepta durante la transición de versiones). */
function ordersEnabledFrom(input: Record<string, unknown>): unknown {
  return input.ordersEnabled !== undefined ? input.ordersEnabled : input.whatsappOrdersEnabled;
}

/** Mensaje de pausa: texto de una o dos líneas; vacío = mensaje por defecto de la web. */
function messageFrom(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const text = value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > ORDERS_MESSAGE_MAX) return { ok: false };
  return { ok: true, value: text || null };
}

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

/** PUT: número e Instagram siempre; el interruptor y su mensaje solo si vienen (si no, no se tocan). */
export type SettingsUpdate = Pick<SiteSettingsData, "whatsappNumber" | "instagramHandle"> & Partial<Pick<SiteSettingsData, "ordersEnabled" | "ordersDisabledMessage">>;

export type ValidationResult =
  | { ok: true; data: SettingsUpdate }
  | { ok: false; errors: Partial<Record<SettingsField | "body", string>> };

/**
 * Valida el body de PUT /api/admin/settings.
 * - whatsappNumber: string (se normaliza) o null/"" para dejarlo sin configurar.
 * - instagramHandle: string (se normaliza) o null/"" para no mostrarlo.
 * - ordersEnabled (opcional; alias anterior: whatsappOrdersEnabled): boolean. Si no viene, no se toca.
 * - ordersDisabledMessage (opcional): texto de hasta 200 caracteres o null.
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

  const data: SettingsUpdate = { whatsappNumber, instagramHandle };
  const ordersEnabled = ordersEnabledFrom(input);
  if (ordersEnabled !== undefined) {
    if (typeof ordersEnabled === "boolean") data.ordersEnabled = ordersEnabled;
    else errors.ordersEnabled = "Valor inválido.";
  }
  if (input.ordersDisabledMessage !== undefined) {
    const message = messageFrom(input.ordersDisabledMessage);
    if (message.ok) data.ordersDisabledMessage = message.value;
    else errors.ordersDisabledMessage = `Máximo ${ORDERS_MESSAGE_MAX} caracteres.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data };
}

export type OrdersPatch = Partial<Pick<SiteSettingsData, "ordersEnabled" | "ordersDisabledMessage">>;

/**
 * Valida el cambio rápido del interruptor (PATCH /api/admin/settings/orders):
 * solo ordersEnabled y/o ordersDisabledMessage; el resto de la configuración no se toca.
 */
export function validateOrdersPatch(body: unknown): { ok: true; data: OrdersPatch } | { ok: false; errors: Partial<Record<SettingsField | "body", string>> } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: { body: "Body inválido." } };
  const input = body as Record<string, unknown>;
  const data: OrdersPatch = {};
  const errors: Partial<Record<SettingsField | "body", string>> = {};
  if ("ordersEnabled" in input) {
    if (typeof input.ordersEnabled === "boolean") data.ordersEnabled = input.ordersEnabled;
    else errors.ordersEnabled = "Valor inválido.";
  }
  if ("ordersDisabledMessage" in input) {
    const message = messageFrom(input.ordersDisabledMessage);
    if (message.ok) data.ordersDisabledMessage = message.value;
    else errors.ordersDisabledMessage = `Máximo ${ORDERS_MESSAGE_MAX} caracteres.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) return { ok: false, errors: { body: "No hay cambios." } };
  return { ok: true, data };
}
