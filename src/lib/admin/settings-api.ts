import { apiUrl, fetchWithTimeout } from "@/lib/api";

export type AdminSettings = {
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

export class AdminApiError extends Error {
  constructor(
    public status: number,
    public fields: FieldErrors = {},
  ) {
    super(`admin_api_${status}`);
  }
}

/** Llamadas al backend (Fly) con el token de sesión de Clerk en Authorization. */
async function request(path: string, token: string | null, init: RequestInit = {}) {
  const url = apiUrl(path);
  if (!url) throw new AdminApiError(0);
  if (!token) throw new AdminApiError(401);
  const res = await fetchWithTimeout(url, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeoutMs: 15000,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(res.status, (body as { fields?: FieldErrors }).fields ?? {});
  }
  return (await res.json()) as AdminSettings;
}

export const getAdminSettings = (token: string | null) => request("/api/admin/settings", token);

export const saveAdminSettings = (token: string | null, input: SettingsInput) =>
  request("/api/admin/settings", token, { method: "PUT", body: JSON.stringify(input) });
