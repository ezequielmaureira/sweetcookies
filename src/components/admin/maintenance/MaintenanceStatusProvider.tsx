"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { getAdminSettings, saveMaintenanceStatus, type MaintenancePatch } from "@/lib/admin/settings-api";

type MaintenanceStatus = {
  status: "loading" | "ready" | "error";
  maintenanceEnabled: boolean;
  maintenanceTitle: string | null;
  maintenanceSubtitle: string | null;
  updatedAt: string | null;
  /** Guarda en el servidor (PATCH). Devuelve un mensaje de error o null si salió bien. */
  save: (patch: MaintenancePatch) => Promise<string | null>;
};

const MaintenanceStatusContext = createContext<MaintenanceStatus | null>(null);

/**
 * Estado del interruptor "Modo mantenimiento" compartido por todo el panel
 * (indicador del encabezado + la página de configuración), leído del servidor.
 * Clon de OrdersStatusProvider con los campos de mantenimiento.
 */
export function MaintenanceStatusProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [status, setStatus] = useState<MaintenanceStatus["status"]>("loading");
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await getAdminSettings(await getToken());
        if (cancelled) return;
        setMaintenanceEnabled(settings.maintenanceEnabled);
        setTitle(settings.maintenanceTitle);
        setSubtitle(settings.maintenanceSubtitle);
        setUpdatedAt(settings.updatedAt);
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
    async (patch: MaintenancePatch) => {
      try {
        const saved = await saveMaintenanceStatus(await getToken(), patch);
        setMaintenanceEnabled(saved.maintenanceEnabled);
        setTitle(saved.maintenanceTitle);
        setSubtitle(saved.maintenanceSubtitle);
        setUpdatedAt(saved.updatedAt);
        setStatus("ready");
        return null;
      } catch (error) {
        return adminErrorMessage(error, "No pudimos guardar el cambio. Probá de nuevo.");
      }
    },
    [getToken],
  );

  const value = useMemo(
    () => ({ status, maintenanceEnabled, maintenanceTitle: title, maintenanceSubtitle: subtitle, updatedAt, save }),
    [status, maintenanceEnabled, title, subtitle, updatedAt, save],
  );
  return <MaintenanceStatusContext.Provider value={value}>{children}</MaintenanceStatusContext.Provider>;
}

export function useMaintenanceStatus() {
  const ctx = useContext(MaintenanceStatusContext);
  if (!ctx) throw new Error("useMaintenanceStatus debe usarse dentro de <MaintenanceStatusProvider>");
  return ctx;
}
