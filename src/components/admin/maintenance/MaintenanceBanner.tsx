"use client";

import Link from "next/link";
import { useMaintenanceStatus } from "./MaintenanceStatusProvider";
import styles from "./MaintenanceBanner.module.css";

/** Aviso visible en todo el panel mientras la tienda está en mantenimiento. */
export function MaintenanceBanner() {
  const { status, maintenanceEnabled } = useMaintenanceStatus();
  if (status !== "ready" || !maintenanceEnabled) return null;
  return (
    <div className={styles.banner} role="status">
      <span aria-hidden="true">🟠</span>
      La tienda está en modo mantenimiento.{" "}
      <Link href="/admin/mantenimiento" className={styles.link}>
        Ver configuración
      </Link>
    </div>
  );
}
