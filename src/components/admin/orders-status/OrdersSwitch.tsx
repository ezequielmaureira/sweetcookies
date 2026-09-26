"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useOrdersStatus } from "./OrdersStatusProvider";
import styles from "./OrdersStatus.module.css";

const MESSAGE_MAX = 200;

/**
 * Interruptor maestro "Pedidos activos". Pausar pide confirmación; activar es
 * directo. Se guarda al instante en el servidor. Con `withMessage`, además
 * permite editar el mensaje que ve el comprador mientras están pausados.
 */
export function OrdersSwitch({ withMessage = false }: { withMessage?: boolean }) {
  const { status, ordersEnabled, ordersDisabledMessage, save } = useOrdersStatus();
  const uid = useId();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [messageDraft, setMessageDraft] = useState<string | null>(null);
  const message = messageDraft ?? ordersDisabledMessage ?? "";

  useEffect(() => {
    const dialog = confirmRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) dialog.showModal();
    if (!confirming && dialog.open) dialog.close();
  }, [confirming]);

  const apply = async (next: boolean) => {
    setConfirming(false);
    setSaving(true);
    const error = await save({ ordersEnabled: next });
    setSaving(false);
    setFeedback(error ? { kind: "error", text: error } : { kind: "ok", text: next ? "Pedidos activados." : "Pedidos pausados correctamente." });
  };

  const onToggle = () => {
    if (saving || status !== "ready") return;
    if (ordersEnabled) setConfirming(true);
    else void apply(true);
  };

  const saveMessage = async () => {
    setSaving(true);
    const error = await save({ ordersDisabledMessage: message.trim() || null });
    setSaving(false);
    if (!error) setMessageDraft(null);
    setFeedback(error ? { kind: "error", text: error } : { kind: "ok", text: "Mensaje guardado." });
  };

  if (status === "loading") {
    return (
      <section className={styles.card} aria-busy="true">
        <p className={styles.kicker}>Pedidos</p>
        <p className={styles.help}>Cargando estado…</p>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className={styles.card}>
        <p className={styles.kicker}>Pedidos</p>
        <p className={styles.error} role="alert">
          No pudimos leer el estado de los pedidos. Recargá la página.
        </p>
      </section>
    );
  }

  return (
    <section className={[styles.card, ordersEnabled ? styles.cardOn : styles.cardOff].join(" ")} aria-labelledby={`${uid}-title`}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <p id={`${uid}-title`} className={styles.kicker}>
            Pedidos activos
          </p>
          <p className={styles.state}>{ordersEnabled ? "Pedidos activos" : "Pedidos pausados"}</p>
          <p className={styles.help}>
            {ordersEnabled
              ? "Los clientes pueden confirmar pedidos."
              : "Los clientes ven los productos, pero no pueden confirmar pedidos nuevos."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ordersEnabled}
          aria-labelledby={`${uid}-title`}
          className={styles.bigSwitch}
          onClick={onToggle}
          disabled={saving}
        >
          <span className={styles.bigLabel}>{ordersEnabled ? "ACTIVO" : "PAUSADO"}</span>
          <span className={styles.bigThumb} aria-hidden="true" />
        </button>
      </div>

      <p className={feedback?.kind === "error" ? styles.error : styles.feedback} role={feedback?.kind === "error" ? "alert" : "status"}>
        {saving ? "Guardando…" : feedback?.text}
      </p>

      {withMessage && (
        <div className={styles.messageBox}>
          <label htmlFor={`${uid}-message`} className={styles.label}>
            Mensaje para los clientes mientras estén pausados <span className={styles.optional}>(opcional)</span>
          </label>
          <textarea
            id={`${uid}-message`}
            className={styles.textarea}
            rows={2}
            maxLength={MESSAGE_MAX}
            placeholder="Ej.: Estamos de vacaciones hasta el 15 de octubre."
            value={message}
            onChange={(e) => setMessageDraft(e.target.value)}
          />
          <div className={styles.messageActions}>
            <span className={styles.help}>Si queda vacío, se muestra un mensaje por defecto. {message.length}/{MESSAGE_MAX}</span>
            <Button variant="secondary" onClick={saveMessage} disabled={saving || messageDraft === null}>
              Guardar mensaje
            </Button>
          </div>
        </div>
      )}

      {!withMessage && (
        <Link href="/admin/configuracion" className={styles.link}>
          Editar el mensaje para clientes →
        </Link>
      )}

      <dialog ref={confirmRef} className={styles.dialog} aria-labelledby={`${uid}-confirm`} onClose={() => setConfirming(false)}>
        {confirming && (
          <div className={styles.dialogBody}>
            <h2 id={`${uid}-confirm`} className={styles.dialogTitle}>
              ¿Pausar los pedidos?
            </h2>
            <p className={styles.help}>
              Los clientes podrán seguir viendo los productos, pero no podrán confirmar nuevos pedidos hasta que los vuelvas a activar.
            </p>
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void apply(false)}>Pausar pedidos</Button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

/** Indicador compacto para el encabezado del panel: "Pedidos: ACTIVOS / PAUSADOS". */
export function OrdersStatusPill() {
  const { status, ordersEnabled } = useOrdersStatus();
  if (status !== "ready") return null;
  return (
    <Link href="/admin" className={[styles.pill, ordersEnabled ? styles.pillOn : styles.pillOff].join(" ")} title="Cambiar estado de los pedidos">
      <span className={styles.dot} aria-hidden="true" />
      Pedidos: <strong>{ordersEnabled ? "ACTIVOS" : "PAUSADOS"}</strong>
    </Link>
  );
}
