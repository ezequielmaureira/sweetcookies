"use client";

import { useEffect, useState } from "react";

/**
 * Hora del SERVIDOR (no la del teléfono), avanzando de a un segundo.
 * `offsetMs` = hora del servidor − hora local, medido al leer la API.
 * null hasta el primer tic (así el render del servidor y el del navegador coinciden).
 */
export function useServerNow(offsetMs: number): number | null {
  const [local, setLocal] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLocal(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  return local === null ? null : local + offsetMs;
}
