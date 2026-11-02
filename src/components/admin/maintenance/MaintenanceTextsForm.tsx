"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MaintenanceScreen } from "@/components/maintenance/MaintenanceScreen";
import { MAINTENANCE_SUBTITLE_MAX, MAINTENANCE_TITLE_MAX } from "@/components/maintenance/maintenance-copy";
import ordersStyles from "@/components/admin/orders-status/OrdersStatus.module.css";
import { useMaintenanceStatus } from "./MaintenanceStatusProvider";
import styles from "./MaintenanceTextsForm.module.css";

/**
 * Frase principal y subfrase de la pantalla de mantenimiento, con vista previa
 * en vivo (funciona esté o no activado el mantenimiento: usa el borrador, no
 * lo guardado). El mensaje fijo "¡Volvemos muy pronto!" no es editable.
 */
export function MaintenanceTextsForm() {
  const { status, maintenanceTitle, maintenanceSubtitle, save } = useMaintenanceStatus();
  const uid = useId();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [subtitleDraft, setSubtitleDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");

  if (status !== "ready") return null;

  const title = titleDraft ?? maintenanceTitle ?? "";
  const subtitle = subtitleDraft ?? maintenanceSubtitle ?? "";
  const dirty = titleDraft !== null || subtitleDraft !== null;

  const onSave = async () => {
    setSaving(true);
    const error = await save({ maintenanceTitle: title.trim() || null, maintenanceSubtitle: subtitle.trim() || null });
    setSaving(false);
    if (!error) {
      setTitleDraft(null);
      setSubtitleDraft(null);
    }
    setFeedback(error ? { kind: "error", text: error } : { kind: "ok", text: "Textos guardados." });
  };

  return (
    <section className={ordersStyles.card}>
      <p className={ordersStyles.kicker}>Textos de la pantalla de mantenimiento</p>

      <div className={styles.field}>
        <label htmlFor={`${uid}-title`} className={ordersStyles.label}>
          Frase principal
        </label>
        <textarea
          id={`${uid}-title`}
          className={ordersStyles.textarea}
          rows={2}
          maxLength={MAINTENANCE_TITLE_MAX}
          placeholder="Estamos horneando algo especial…"
          value={title}
          onChange={(e) => setTitleDraft(e.target.value)}
        />
        <span className={ordersStyles.help}>
          {title.length}/{MAINTENANCE_TITLE_MAX}
        </span>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${uid}-subtitle`} className={ordersStyles.label}>
          Subfrase
        </label>
        <textarea
          id={`${uid}-subtitle`}
          className={ordersStyles.textarea}
          rows={2}
          maxLength={MAINTENANCE_SUBTITLE_MAX}
          placeholder="Nuestra cocina digital está tomando un pequeño descanso."
          value={subtitle}
          onChange={(e) => setSubtitleDraft(e.target.value)}
        />
        <span className={ordersStyles.help}>
          {subtitle.length}/{MAINTENANCE_SUBTITLE_MAX}
        </span>
      </div>

      <div className={ordersStyles.messageActions}>
        <span className={ordersStyles.help}>Si queda vacío, se usa el texto por defecto.</span>
        <Button onClick={onSave} disabled={saving || !dirty}>
          Guardar cambios
        </Button>
      </div>

      <p className={feedback?.kind === "error" ? ordersStyles.error : ordersStyles.feedback} role={feedback?.kind === "error" ? "alert" : "status"}>
        {saving ? "Guardando…" : feedback?.text}
      </p>

      <div className={styles.previewSection}>
        <div className={styles.previewHead}>
          <p className={ordersStyles.kicker}>Vista previa de lo que verán tus clientes</p>
          <div className={styles.previewToggle} role="group" aria-label="Formato de la vista previa">
            <button type="button" className={preview === "desktop" ? styles.previewBtnActive : styles.previewBtn} onClick={() => setPreview("desktop")}>
              Escritorio
            </button>
            <button type="button" className={preview === "mobile" ? styles.previewBtnActive : styles.previewBtn} onClick={() => setPreview("mobile")}>
              Móvil
            </button>
          </div>
        </div>
        <div className={preview === "mobile" ? styles.previewFrameMobile : styles.previewFrameDesktop}>
          <div className={styles.previewScale}>
            <MaintenanceScreen title={title} subtitle={subtitle} className={styles.previewVariant} />
          </div>
        </div>
      </div>
    </section>
  );
}
