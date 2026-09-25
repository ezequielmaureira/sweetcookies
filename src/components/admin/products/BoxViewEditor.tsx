"use client";

import { useId, useRef, useState } from "react";
import { CookieShape } from "@/components/cookie-shape/CookieShape";
import type { BoxViewInput } from "@/lib/admin/admin-api";
import { boxViewSource } from "@/lib/box-view";
import styles from "./Products.module.css";

type BoxViewEditorProps = {
  /** Foto principal actual del formulario. */
  imageUrl: string | null;
  value: BoxViewInput;
  onChange: (patch: Partial<BoxViewInput>) => void;
  /** Sube una imagen para caja y devuelve su ruta (o null si falló; el error lo muestra el padre). */
  onUpload: (file: File) => Promise<string | null>;
  uploading: boolean;
  error?: string;
};

type Mode = "main" | "specific";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * "Vista en caja": cómo se ve la cookie dentro de la caja del comprador.
 * Modo A: la foto principal, encuadrada. Modo B (opcional): una imagen propia
 * para la caja. El encuadre (zoom, posición, rotación) aplica a la imagen usada.
 */
export function BoxViewEditor({ imageUrl, value, onChange, onUpload, uploading, error }: BoxViewEditorProps) {
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(value.boxImageUrl ? "specific" : "main");
  // Si se vuelve a "foto principal" y después a "específica" sin guardar, se recupera la subida.
  const [lastSpecific, setLastSpecific] = useState<string | null>(value.boxImageUrl);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; size: number } | null>(null);

  const view = boxViewSource({ ...value, imageUrl });

  const chooseMode = (next: Mode) => {
    setMode(next);
    if (next === "main") {
      if (value.boxImageUrl) setLastSpecific(value.boxImageUrl);
      onChange({ boxImageUrl: null });
    } else if (lastSpecific) {
      onChange({ boxImageUrl: lastSpecific });
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const url = await onUpload(file);
    if (url) {
      setLastSpecific(url);
      // Imagen nueva: encuadre centrado para empezar.
      onChange({ boxImageUrl: url, boxImageScale: 1, boxImageX: 50, boxImageY: 50, boxImageRotation: 0 });
    }
  };

  // Arrastrar sobre la cookie mueve el encuadre (mismo efecto que los controles).
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!view.src) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, startX: value.boxImageX, startY: value.boxImageY, size: event.currentTarget.clientWidth };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const factor = 100 / (d.size * value.boxImageScale);
    onChange({
      boxImageX: round(clamp(d.startX - (event.clientX - d.x) * factor, 0, 100)),
      boxImageY: round(clamp(d.startY - (event.clientY - d.y) * factor, 0, 100)),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const slider = (
    field: "boxImageScale" | "boxImageX" | "boxImageY" | "boxImageRotation",
    label: string,
    min: number,
    max: number,
    step: number,
    display: string,
  ) => (
    <div className={styles.slider}>
      <label htmlFor={id(field)} className={styles.sliderLabel}>
        <span>{label}</span>
        <output htmlFor={id(field)} className={styles.sliderValue}>
          {display}
        </output>
      </label>
      <input
        id={id(field)}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[field]}
        disabled={!view.src}
        onChange={(e) => onChange({ [field]: Number(e.target.value) })}
      />
    </div>
  );

  return (
    <section className={styles.boxView} aria-labelledby={id("title")}>
      <div>
        <h3 id={id("title")} className={styles.boxViewTitle}>
          Vista en caja
        </h3>
        <p className={styles.help}>Así se ve esta cookie dentro de la caja del comprador. En el catálogo se sigue usando la foto principal.</p>
      </div>

      <div className={styles.segmented} role="radiogroup" aria-label="Imagen para la caja">
        <label className={styles.segment}>
          <input type="radio" name={id("mode")} checked={mode === "main"} onChange={() => chooseMode("main")} />
          <span>Usar foto principal</span>
        </label>
        <label className={styles.segment}>
          <input type="radio" name={id("mode")} checked={mode === "specific"} onChange={() => chooseMode("specific")} />
          <span>Imagen para caja</span>
        </label>
      </div>

      {mode === "specific" && (
        <div className={styles.specific}>
          <p className={styles.help}>
            Opcional. {value.boxImageUrl ? "La caja usa esta imagen." : "Mientras no subas una, la caja usa la foto principal."}
          </p>
          <div className={styles.uploadRow}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={handleFile} />
            <button type="button" className={styles.uploadButton} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Subiendo…" : value.boxImageUrl ? "Cambiar imagen para caja" : "Subir imagen para caja"}
            </button>
            {value.boxImageUrl && (
              <button type="button" className={styles.linkButton} onClick={() => chooseMode("main")} disabled={uploading}>
                Quitar y usar la foto principal
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.boxViewBody}>
        <div className={styles.boxViewPreview}>
          <div
            className={[styles.dragArea, view.src ? styles.dragEnabled : ""].join(" ")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-hidden="true"
          >
            <CookieShape view={view} sizes="200px" />
          </div>
          <p className={styles.previewCaption}>
            {view.src
              ? `${view.specific ? "Imagen para caja" : "Foto principal"} · arrastrá para encuadrar`
              : "Cargá la foto principal para ver la cookie."}
          </p>
          {/* Contexto: así queda junto a otras cookies en la caja. */}
          <div className={styles.miniBox} aria-hidden="true">
            {[0, 1, 2].map((variant) => (
              <span key={variant} className={styles.miniSlot}>
                <CookieShape view={view} variant={variant} sizes="64px" />
              </span>
            ))}
          </div>
        </div>

        <div className={styles.sliders}>
          {slider("boxImageScale", "Zoom", 1, 4, 0.05, `${Math.round(value.boxImageScale * 100)}%`)}
          {slider("boxImageX", "Horizontal", 0, 100, 0.5, `${Math.round(value.boxImageX)}%`)}
          {slider("boxImageY", "Vertical", 0, 100, 0.5, `${Math.round(value.boxImageY)}%`)}
          {slider("boxImageRotation", "Rotación", -180, 180, 1, `${value.boxImageRotation}°`)}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => onChange({ boxImageScale: 1, boxImageX: 50, boxImageY: 50, boxImageRotation: 0 })}
            disabled={!view.src}
          >
            Restablecer encuadre
          </button>
        </div>
      </div>
    </section>
  );
}
