import type { Metadata } from "next";
import { MaintenanceScreen } from "@/components/maintenance/MaintenanceScreen";
import { getPublicSettings } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Sweet Cookies — en mantenimiento",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Pantalla a la que `middleware.ts` reescribe cualquier ruta pública cuando el
 * modo mantenimiento está activo. No reemplaza ni altera las rutas reales.
 */
export default async function MantenimientoPage() {
  const settings = await getPublicSettings();
  return <MaintenanceScreen title={settings.maintenanceTitle} subtitle={settings.maintenanceSubtitle} />;
}
