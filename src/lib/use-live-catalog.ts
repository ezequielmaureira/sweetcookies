"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, fetchWithTimeout } from "@/lib/api";
import { PUBLIC_PRODUCTS_PATH, parseCatalog, type Product } from "@/lib/catalog";

export type CatalogStatus = "ready" | "loading" | "error";

/** Reintentos si la API está despertando (Fly apaga la máquina sin tráfico). */
const RETRY_DELAYS_MS = [0, 2500, 6000];

async function fetchCatalog(): Promise<Product[] | null> {
  const url = apiUrl(PUBLIC_PRODUCTS_PATH);
  if (!url) return null;
  try {
    const res = await fetchWithTimeout(url, { cache: "no-store", timeoutMs: 10000 });
    return res.ok ? parseCatalog(await res.json()) : null;
  } catch {
    return null;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Catálogo del comprador SIEMPRE fresco.
 *
 * El HTML llega con el catálogo del render del servidor (rápido, pero puede
 * venir de caché: ISR de la página y caché del router del navegador). Apenas
 * carga, el navegador vuelve a pedir GET /api/public/products sin caché y
 * reemplaza la lista; también al volver a la pestaña. Así lo que se cambia en
 * el admin (precio, stock, pausado) se ve en segundos, aunque la página
 * cacheada esté vieja o se haya generado con la API dormida.
 */
export function useLiveCatalog(initialProducts: Product[], initialOk: boolean) {
  const [products, setProducts] = useState(initialProducts);
  const [status, setStatus] = useState<CatalogStatus>(initialOk ? "ready" : "loading");
  const inFlight = useRef<Promise<void> | null>(null);
  const hadData = useRef(initialOk);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = (async () => {
      for (const delay of RETRY_DELAYS_MS) {
        if (delay) await wait(delay);
        const fresh = await fetchCatalog();
        if (fresh) {
          hadData.current = true;
          setProducts(fresh);
          setStatus("ready");
          return;
        }
      }
      // Sin respuesta: si ya había datos (del servidor) se siguen mostrando.
      if (!hadData.current) setStatus("error");
    })().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const retry = useCallback(() => {
    setStatus((s) => (s === "error" ? "loading" : s));
    return refresh();
  }, [refresh]);

  return { products, status, refresh: retry };
}
