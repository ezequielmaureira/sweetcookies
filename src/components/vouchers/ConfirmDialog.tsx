"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./Voucher.module.css";

type Props = {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmación modal (<dialog> nativo: foco, Esc y fondo resueltos por el navegador). */
export function ConfirmDialog({ open, title, children, confirmLabel, busy = false, danger = false, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={`${uid}-title`} onClose={onCancel}>
      {open && (
        <div className={styles.dialogBody}>
          <h2 id={`${uid}-title`} className={styles.dialogTitle}>
            {title}
          </h2>
          {children}
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={onConfirm} disabled={busy} className={danger ? styles.dangerButton : undefined}>
              {busy ? "Procesando…" : confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
