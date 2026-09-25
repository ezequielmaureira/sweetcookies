/**
 * URL pública del backend (Fly.io). Ej.: https://sweetcookies-api.fly.dev
 * Sin barra final. Vacía = sin backend configurado (se usan valores de respaldo).
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

export function apiUrl(path: string): string | null {
  return API_URL ? `${API_URL}${path}` : null;
}

/** fetch con timeout (evita que un backend dormido bloquee la UI). */
export async function fetchWithTimeout(input: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
