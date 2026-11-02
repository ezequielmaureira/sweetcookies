"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import styles from "@/components/admin/orders-status/OrdersStatus.module.css";
import { useMaintenanceStatus } from "./MaintenanceStatusProvider";

/**
 * Interruptor grande "Modo mantenimiento". A diferencia de "Pedidos activos",
 * acá se pide confirmación en los DOS sentidos (activar y desactivar), porque
 * activar reemplaza toda la tienda pública por la pantalla de mantenimiento.
 */
export function MaintenanceSwitch() {
  const { status, maintenanceEnabled, updatedAt, save } = useMaintenanceStatus();
  const uid = useId();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<"activate" | "deactivate" | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = confirmRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) dialog.showModal();
    if (!confirming && dialog.open) dialog.close();
  }, [confirming]);

  const apply = async (next: boolean) => {
    setConfirming(null);
    setSaving(true);
    const error = await save({ maintenanceEnabled: next });
    setSaving(false);
    setFeedback(error ? { kind: "error", text: error } : { kind: "ok", text: next ? "Modo mantenimiento activado." : "Modo mantenimiento desactivado." });
  };

  const onToggle = () => {
    if (saving || status !== "ready") return;
    setConfirming(maintenanceEnabled ? "deactivate" : "activate");
  };

  if (status === "loading") {
    return (
      <section className={styles.card} aria-busy="true">
        <p className={styles.kicker}>Modo mantenimiento</p>
        <p className={styles.help}>Cargando estado…</p>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className={styles.card}>
        <p className={styles.kicker}>Modo mantenimiento</p>
        <p className={styles.error} role="alert">
          No pudimos leer el estado del mantenimiento. Recargá la página.
        </p>
      </section>
    );
  }

  return (
    <section className={[styles.card, maintenanceEnabled ? styles.cardOff : styles.cardOn].join(" ")} aria-labelledby={`${uid}-title`}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <p id={`${uid}-title`} className={styles.kicker}>
            Modo mantenimiento
          </p>
          <p className={styles.state}>{maintenanceEnabled ? "Tienda en mantenimiento" : "Tienda activa"}</p>
          <p className={styles.help}>
            {maintenanceEnabled
              ? "Los clientes ven la pantalla de mantenimiento. Vos conservás acceso completo al panel."
              : "Los clientes navegan y compran con normalidad."}
          </p>
          {updatedAt && <p className={styles.help}>Último cambio: {new Date(updatedAt).toLocaleString("es-AR")}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={maintenanceEnabled}
          aria-labelledby={`${uid}-title`}
          className={styles.bigSwitch}
          onClick={onToggle}
          disabled={saving}
        >
          <span className={styles.bigLabel}>{maintenanceEnabled ? "ACTIVO" : "INACTIVO"}</span>
          <span className={styles.bigThumb} aria-hidden="true" />
        </button>
      </div>

      <p className={feedback?.kind === "error" ? styles.error : styles.feedback} role={feedback?.kind === "error" ? "alert" : "status"}>
        {saving ? "Guardando…" : feedback?.text}
      </p>

      <dialog ref={confirmRef} className={styles.dialog} aria-labelledby={`${uid}-confirm`} onClose={() => setConfirming(null)}>
        {confirming === "activate" && (
          <div className={styles.dialogBody}>
            <h2 id={`${uid}-confirm`} className={styles.dialogTitle}>
              ¿Activar el modo mantenimiento?
            </h2>
            <p className={styles.help}>
              Los clientes verán temporalmente la pantalla &quot;Estamos horneando algo especial&quot; en vez de la tienda.
            </p>
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void apply(true)}>Activar mantenimiento</Button>
            </div>
          </div>
        )}
        {confirming === "deactivate" && (
          <div className={styles.dialogBody}>
            <h2 id={`${uid}-confirm`} className={styles.dialogTitle}>
              ¿Desactivar el modo mantenimiento?
            </h2>
            <p className={styles.help}>La tienda vuelve a estar disponible para los clientes de inmediato.</p>
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void apply(false)}>Desactivar mantenimiento</Button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

/** Indicador compacto para el encabezado del panel: 🟢 Tienda activa / 🟠 Mantenimiento activado. */
export function MaintenanceStatusPill() {
  const { status, maintenanceEnabled } = useMaintenanceStatus();
  if (status !== "ready") return null;
  return (
    <Link href="/admin/mantenimiento" className={[styles.pill, maintenanceEnabled ? styles.pillOff : styles.pillOn].join(" ")} title="Cambiar modo mantenimiento">
      <span aria-hidden="true">{maintenanceEnabled ? "🟠" : "🟢"}</span>
      {maintenanceEnabled ? "Mantenimiento activado" : "Tienda activa"}
    </Link>
  );
}
