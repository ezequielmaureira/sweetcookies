"use client";

import { useEffect, useState } from "react";
import { apiUrl, fetchWithTimeout } from "@/lib/api";
import { FALLBACK_SETTINGS, PUBLIC_SETTINGS_PATH, parsePublicSettings, type PublicSettings } from "@/lib/site-settings";

export type PublicSettingsState =
  | { status: "loading"; settings: null }
  | { status: "ready" | "fallback"; settings: PublicSettings };

const CACHE_MS = 30_000;
let cache: { at: number; promise: Promise<PublicSettingsState> } | null = null;

async function load(): Promise<PublicSettingsState> {
  const url = apiUrl(PUBLIC_SETTINGS_PATH);
  if (!url) return { status: "fallback", settings: FALLBACK_SETTINGS };
  try {
    // El backend puede tardar si estaba dormido: timeout generoso.
    const res = await fetchWithTimeout(url, { cache: "no-store", timeoutMs: 10000 });
    const parsed = res.ok ? parsePublicSettings(await res.json()) : null;
    return parsed ? { status: "ready", settings: parsed } : { status: "fallback", settings: FALLBACK_SETTINGS };
  } catch {
    return { status: "fallback", settings: FALLBACK_SETTINGS };
  }
}

/** Pide la configuración una vez (compartida entre componentes, caché de 30 s). */
export function prefetchPublicSettings(): Promise<PublicSettingsState> {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), promise: load() };
  return cache.promise;
}

/**
 * Configuración pública fresca en el cliente (estado del pedido por WhatsApp).
 * Mientras carga, status = "loading": el botón de envío debe quedar deshabilitado.
 */
export function usePublicSettings(): PublicSettingsState {
  const [state, setState] = useState<PublicSettingsState>({ status: "loading", settings: null });

  useEffect(() => {
    let active = true;
    void prefetchPublicSettings().then((result) => {
      if (active) setState(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
