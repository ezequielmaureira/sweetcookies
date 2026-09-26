"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { getAdminSettings, saveOrdersStatus, type OrdersPatch } from "@/lib/admin/settings-api";

type OrdersStatus = {
  status: "loading" | "ready" | "error";
  ordersEnabled: boolean;
  ordersDisabledMessage: string | null;
  /** Guarda en el servidor (PATCH). Devuelve un mensaje de error o null si salió bien. */
  save: (patch: OrdersPatch) => Promise<string | null>;
};

const OrdersStatusContext = createContext<OrdersStatus | null>(null);

/**
 * Estado del interruptor maestro "Pedidos activos" compartido por todo el panel
 * (indicador del encabezado + interruptor grande), leído del servidor.
 */
export function OrdersStatusProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [status, setStatus] = useState<OrdersStatus["status"]>("loading");
  const [ordersEnabled, setOrdersEnabled] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await getAdminSettings(await getToken());
        if (cancelled) return;
        setOrdersEnabled(settings.ordersEnabled);
        setMessage(settings.ordersDisabledMessage);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken]);

  const save = useCallback(
    async (patch: OrdersPatch) => {
      try {
        const saved = await saveOrdersStatus(await getToken(), patch);
        setOrdersEnabled(saved.ordersEnabled);
        setMessage(saved.ordersDisabledMessage);
        setStatus("ready");
        return null;
      } catch (error) {
        return adminErrorMessage(error, "No pudimos guardar el cambio. Probá de nuevo.");
      }
    },
    [getToken],
  );

  const value = useMemo(() => ({ status, ordersEnabled, ordersDisabledMessage: message, save }), [status, ordersEnabled, message, save]);
  return <OrdersStatusContext.Provider value={value}>{children}</OrdersStatusContext.Provider>;
}

export function useOrdersStatus() {
  const ctx = useContext(OrdersStatusContext);
  if (!ctx) throw new Error("useOrdersStatus debe usarse dentro de <OrdersStatusProvider>");
  return ctx;
}
