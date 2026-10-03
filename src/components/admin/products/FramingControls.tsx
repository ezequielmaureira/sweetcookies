"use client";

import { useId, useRef } from "react";
import styles from "./Products.module.css";

/** Encuadre de una foto: zoom (1–4), punto central (0–100 %) y, opcional, rotación. */
export type Framing = { scale: number; x: number; y: number; rotation?: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Arrastrar sobre la vista previa mueve el encuadre (mismo efecto que los
 * controles). Lo usan la foto principal y la vista en caja.
 */
export function useFramingDrag(value: Framing, onChange: (patch: Partial<Framing>) => void, enabled: boolean) {
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; size: number } | null>(null);
  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, startX: value.x, startY: value.y, size: event.currentTarget.clientWidth };
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const factor = 100 / (d.size * value.scale);
      onChange({ x: round(clamp(d.startX - (event.clientX - d.x) * factor, 0, 100)), y: round(clamp(d.startY - (event.clientY - d.y) * factor, 0, 100)) });
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };
}

/** Controles de encuadre: Zoom, Horizontal, Vertical (y Rotación si se pide) + "Restablecer". */
export function FramingControls({
  value,
  onChange,
  disabled,
  withRotation = false,
}: {
  value: Framing;
  onChange: (patch: Partial<Framing>) => void;
  disabled: boolean;
  withRotation?: boolean;
}) {
  const uid = useId();
  const slider = (field: keyof Framing, label: string, min: number, max: number, step: number, display: string) => (
    <div className={styles.slider}>
      <label htmlFor={`${uid}-${field}`} className={styles.sliderLabel}>
        <span>{label}</span>
        <output htmlFor={`${uid}-${field}`} className={styles.sliderValue}>
          {display}
        </output>
      </label>
      <input
        id={`${uid}-${field}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[field] ?? 0}
        disabled={disabled}
        onChange={(e) => onChange({ [field]: Number(e.target.value) })}
      />
    </div>
  );

  return (
    <div className={styles.sliders}>
      {slider("scale", "Zoom", 1, 4, 0.05, `${Math.round(value.scale * 100)}%`)}
      {slider("x", "Horizontal", 0, 100, 0.5, `${Math.round(value.x)}%`)}
      {slider("y", "Vertical", 0, 100, 0.5, `${Math.round(value.y)}%`)}
      {withRotation && slider("rotation", "Rotación", -180, 180, 1, `${value.rotation ?? 0}°`)}
      <button type="button" className={styles.linkButton} onClick={() => onChange({ scale: 1, x: 50, y: 50, ...(withRotation ? { rotation: 0 } : {}) })} disabled={disabled}>
        Restablecer encuadre
      </button>
    </div>
  );
}

/** Zona de vista previa arrastrable (para usar dentro de componentes con returns tempranos). */
export function FramingArea({
  value,
  onChange,
  enabled,
  className,
  children,
}: {
  value: Framing;
  onChange: (patch: Partial<Framing>) => void;
  enabled: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const handlers = useFramingDrag(value, onChange, enabled);
  return (
    <div className={className} {...handlers} aria-hidden="true">
      {children}
    </div>
  );
}
