"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { isRemoteImage } from "@/lib/catalog";
import {
  autoBrushSize,
  fitRect,
  revealedFraction,
  strokePoints,
  type Fit,
  type FocalPoint,
  type Point,
} from "@/lib/cookie-reveal";
import styles from "./CookieReveal.module.css";

export type CookieRevealProps = {
  /** Tapa: la cookie cerrada (se "raspa"). URL ya resuelta. */
  coverImage: string;
  /** Debajo: la cookie abierta mostrando el relleno. URL ya resuelta. */
  revealImage: string;
  revealAlt: string;
  coverAlt?: string;
  /** Diámetro del pincel en px CSS. Por defecto se adapta al tamaño (44–72 px). */
  brushSize?: number;
  /** Fracción descubierta (0–1) a partir de la cual se completa solo. */
  completionThreshold?: number;
  onComplete?: () => void;
  /** Progreso aproximado (0–1), medido cada ~200 ms mientras se raspa. */
  onProgress?: (fraction: number) => void;
  /** Encuadre de ambas capas (mismo para las dos, así quedan alineadas). */
  fit?: Fit;
  focalPoint?: FocalPoint;
  /** Proporción del área (CSS aspect-ratio). */
  aspectRatio?: string;
  /** Color detrás de la tapa (para fotos recortadas sin fondo). */
  coverBackdrop?: string;
  /**
   * Contorno de la zona raspable, en coordenadas 0–1 de la foto de la tapa
   * (ej. el borde de la cookie): el plato y el fondo no se borran y el
   * porcentaje cuenta solo esa zona. Sin esto se raspa toda el área.
   */
  scratchArea?: ReadonlyArray<readonly [number, number]>;
  sizes?: string;
  className?: string;
};

type Phase = "loading" | "ready" | "fallback";

const DEFAULT_FOCAL: FocalPoint = { x: 0.5, y: 0.5 };
/** Resolución de la máscara (lado largo): alcanza para conservar el trazo al redimensionar. */
const MASK_LONG_SIDE = 480;
/** Resolución de la medición del porcentaje (lado largo): barata de leer. */
const PROBE_LONG_SIDE = 72;
/** Tope de píxeles del canvas visible (celulares con DPR 3 se limitan a ~2x). */
const MAX_CANVAS_PIXELS = 2_400_000;
const CHECK_INTERVAL_MS = 180;
const CRUMB_EVERY_PX = 150;
const CRUMB_COLORS = ["#b98552", "#8a5a33", "#d2a26b", "#5a3a28"];

/** Círculo de bordes suaves: se estampa a lo largo del trazo. */
function makeBrush(diameter: number): HTMLCanvasElement {
  const size = Math.max(2, Math.ceil(diameter));
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = size;
  const g = sprite.getContext("2d");
  if (g) {
    const r = size / 2;
    const gradient = g.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.55, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  return sprite;
}

/**
 * "Descubrí el relleno": se pasa el dedo (o el mouse) sobre la cookie cerrada
 * y se va borrando para mostrar la cookie abierta que está debajo.
 *
 * - Capa inferior: <Image> del relleno. Capa superior: la tapa dibujada en un
 *   canvas con el mismo encuadre (object-fit/position calculado a mano).
 * - Borrado: pincel suave estampado con destination-out, interpolado entre
 *   eventos (y eventos coalescidos) para que no queden huecos.
 * - El trazo se guarda también en una máscara propia: sirve para medir el
 *   porcentaje y para rehacer la tapa si cambia el tamaño.
 * - Todo el dibujo es imperativo: React solo se entera al empezar, al
 *   completar y al reiniciar.
 *
 * Se reinicia solo si cambian las imágenes (key interna).
 */
export function CookieReveal(props: CookieRevealProps) {
  return <CookieRevealStage key={`${props.coverImage}|${props.revealImage}`} {...props} />;
}

function CookieRevealStage({
  coverImage,
  revealImage,
  revealAlt,
  coverAlt = "Cookie cerrada",
  brushSize,
  completionThreshold = 0.65,
  onComplete,
  onProgress,
  fit = "cover",
  focalPoint = DEFAULT_FOCAL,
  aspectRatio = "1 / 1",
  coverBackdrop,
  scratchArea,
  sizes = "(max-width: 640px) 100vw, 520px",
  className,
}: CookieRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const crumbsRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [touched, setTouched] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Acciones del motor (las define el efecto; los botones las llaman).
  const completeRef = useRef<() => void>(() => setRevealed(true));
  const resetRef = useRef<() => void>(() => setRevealed(false));
  const callbacks = useRef({ onComplete, onProgress });
  useEffect(() => {
    callbacks.current = { onComplete, onProgress };
  }, [onComplete, onProgress]);

  const focalX = focalPoint.x;
  const focalY = focalPoint.y;
  // Clave estable: un array nuevo con los mismos puntos no reinicia el juego.
  const areaKey = scratchArea?.length ? JSON.stringify(scratchArea) : "";

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const focal = { x: focalX, y: focalY };
    const area = areaKey ? (JSON.parse(areaKey) as [number, number][]) : null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let disposed = false;
    let ctx: CanvasRenderingContext2D | null = null;
    const cover = new window.Image();
    cover.decoding = "async";

    // Máscara del trazo (alfa = borrado), en coordenadas del área, independiente del tamaño en pantalla.
    const mask = document.createElement("canvas");
    const maskCtx = mask.getContext("2d");
    // Lectura del porcentaje (nunca recibe la tapa, así no se "contamina" con imágenes de otro origen).
    const probe = document.createElement("canvas");
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    let weights: Float32Array | null = null;
    let maskSized = false;
    // Recorte a la zona raspable (se mantiene activo en ambos contextos mientras se dibuja).
    let coverClip: Path2D | null = null;
    let coverClipped = false;
    let maskClipped = false;

    /** Contorno de la zona raspable en píxeles de un canvas de w×h (mismo encuadre que la tapa). */
    const areaPath = (w: number, h: number): Path2D | null => {
      if (!area) return null;
      const r = fitRect(cover.naturalWidth, cover.naturalHeight, w, h, fit, focal);
      const path = new Path2D();
      area.forEach(([x, y], i) => (i ? path.lineTo(r.x + x * r.width, r.y + y * r.height) : path.moveTo(r.x + x * r.width, r.y + y * r.height)));
      path.closePath();
      return path;
    };

    let cssWidth = 0;
    let cssHeight = 0;
    let pxPerCss = 1;
    let maskPerCss = 1;
    let radiusCss = 30;
    let brush: HTMLCanvasElement | null = null;
    let maskBrush: HTMLCanvasElement | null = null;

    let activePointer: number | null = null;
    let last: Point | null = null;
    let box: DOMRect | null = null;
    let completed = false;
    let firstTouch = true;
    let checkTimer = 0;
    let travelled = 0;
    let nextCrumbAt = CRUMB_EVERY_PX;

    const paintCover = () => {
      if (!ctx) return;
      if (coverClipped) {
        ctx.restore();
        coverClipped = false;
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (coverBackdrop) {
        ctx.fillStyle = coverBackdrop;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const r = fitRect(cover.naturalWidth, cover.naturalHeight, canvas.width, canvas.height, fit, focal);
      ctx.drawImage(cover, r.x, r.y, r.width, r.height);
      // Rehace lo que ya se había borrado (ej. después de girar el celular).
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
      // Desde acá, el pincel solo borra dentro de la zona raspable.
      if (coverClip) {
        ctx.save();
        ctx.clip(coverClip);
        coverClipped = true;
      }
    };

    /**
     * Qué partes cuentan para el porcentaje: la zona raspable si hay contorno;
     * si no, lo opaco de la tapa (una PNG sin fondo: solo la cookie).
     */
    const measureWeights = () => {
      const scratch = document.createElement("canvas");
      scratch.width = probe.width;
      scratch.height = probe.height;
      const g = scratch.getContext("2d", { willReadFrequently: true });
      if (!g) return (weights = null);
      const path = areaPath(scratch.width, scratch.height);
      if (path) g.fill(path);
      else {
        const r = fitRect(cover.naturalWidth, cover.naturalHeight, scratch.width, scratch.height, fit, focal);
        g.drawImage(cover, r.x, r.y, r.width, r.height);
      }
      try {
        const data = g.getImageData(0, 0, scratch.width, scratch.height).data;
        const next = new Float32Array(data.length / 4);
        let solid = 0;
        for (let i = 0; i < next.length; i++) {
          next[i] = data[i * 4 + 3] / 255;
          solid += next[i];
        }
        // Casi todo transparente = algo raro: contar el área entera.
        weights = solid > next.length * 0.05 ? next : null;
      } catch {
        // Imagen de otro origen sin CORS: se cuenta el área entera.
        weights = null;
      }
    };

    const layout = () => {
      if (!ctx) return;
      const rect = root.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      if (Math.abs(rect.width - cssWidth) < 0.5 && Math.abs(rect.height - cssHeight) < 0.5) return;
      cssWidth = rect.width;
      cssHeight = rect.height;

      let density = Math.min(window.devicePixelRatio || 1, 2);
      if (cssWidth * cssHeight * density * density > MAX_CANVAS_PIXELS) {
        density = Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight));
      }
      canvas.width = Math.round(cssWidth * density);
      canvas.height = Math.round(cssHeight * density);
      coverClipped = false; // cambiar el tamaño reinicia el estado del contexto
      coverClip = areaPath(canvas.width, canvas.height);
      pxPerCss = canvas.width / cssWidth;

      const long = Math.max(cssWidth, cssHeight);
      // Un canvas nuevo mide 300×150 por defecto: la máscara se dimensiona una sola vez, con la proporción real.
      if (!maskSized) {
        maskSized = true;
        mask.width = Math.round((MASK_LONG_SIDE * cssWidth) / long);
        mask.height = Math.round((MASK_LONG_SIDE * cssHeight) / long);
      }
      probe.width = Math.max(8, Math.round((PROBE_LONG_SIDE * cssWidth) / long));
      probe.height = Math.max(8, Math.round((PROBE_LONG_SIDE * cssHeight) / long));
      maskPerCss = mask.width / cssWidth;
      if (maskCtx && area && !maskClipped) {
        maskCtx.save();
        maskCtx.clip(areaPath(mask.width, mask.height)!);
        maskClipped = true;
      }

      const diameter = brushSize ?? autoBrushSize(cssWidth, cssHeight);
      radiusCss = diameter / 2;
      brush = makeBrush(diameter * pxPerCss);
      maskBrush = makeBrush(diameter * maskPerCss);

      measureWeights();
      paintCover();
    };

    const stamp = (p: Point) => {
      if (!ctx || !brush || !maskBrush || !maskCtx) return;
      ctx.drawImage(brush, p.x * pxPerCss - brush.width / 2, p.y * pxPerCss - brush.height / 2);
      maskCtx.drawImage(maskBrush, p.x * maskPerCss - maskBrush.width / 2, p.y * maskPerCss - maskBrush.height / 2);
    };

    const checkProgress = () => {
      checkTimer = 0;
      if (completed || !probeCtx) return;
      probeCtx.clearRect(0, 0, probe.width, probe.height);
      probeCtx.drawImage(mask, 0, 0, probe.width, probe.height);
      const fraction = revealedFraction(probeCtx.getImageData(0, 0, probe.width, probe.height).data, weights);
      callbacks.current.onProgress?.(fraction);
      if (fraction >= completionThreshold) complete();
    };

    const scheduleCheck = () => {
      if (!checkTimer) checkTimer = window.setTimeout(checkProgress, CHECK_INTERVAL_MS);
    };

    const spawnCrumbs = (p: Point, count: number) => {
      const layer = crumbsRef.current;
      if (reducedMotion || !layer || layer.childElementCount > 12) return;
      // Migas solo donde realmente se raspa (no sobre el fondo o el plato).
      if (coverClip && ctx && !ctx.isPointInPath(coverClip, p.x * pxPerCss, p.y * pxPerCss)) return;
      for (let i = 0; i < count; i++) {
        const crumb = document.createElement("span");
        const size = 3 + Math.random() * 4;
        crumb.className = styles.crumb;
        crumb.style.cssText =
          `left:${p.x + (Math.random() - 0.5) * radiusCss}px;top:${p.y + (Math.random() - 0.5) * radiusCss}px;` +
          `width:${size}px;height:${size * (0.7 + Math.random() * 0.5)}px;background:${CRUMB_COLORS[i % CRUMB_COLORS.length]};` +
          `--dx:${(Math.random() - 0.5) * 60}px;--dy:${24 + Math.random() * 40}px;--rot:${(Math.random() - 0.5) * 240}deg`;
        crumb.addEventListener("animationend", () => crumb.remove(), { once: true });
        layer.appendChild(crumb);
      }
    };

    const toLocal = (event: PointerEvent): Point => {
      const rect = box ?? canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const endStroke = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return;
      activePointer = null;
      last = null;
      box = null;
      delete root.dataset.scratching;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      // Al soltar se mide enseguida (no esperar al próximo intervalo).
      window.clearTimeout(checkTimer);
      checkProgress();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (completed || activePointer !== null || !event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      activePointer = event.pointerId;
      box = canvas.getBoundingClientRect();
      root.dataset.scratching = "true";
      last = toLocal(event);
      stamp(last);
      spawnCrumbs(last, 4);
      scheduleCheck();
      if (firstTouch) {
        firstTouch = false;
        setTouched(true);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointer || !last) return;
      // Eventos coalescidos: todas las posiciones reales entre dos frames.
      const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      const samples = coalesced.length ? coalesced : [event];
      const spacing = Math.max(1, radiusCss * 0.3);
      for (const sample of samples) {
        const point = toLocal(sample);
        travelled += Math.hypot(point.x - last.x, point.y - last.y);
        for (const q of strokePoints(last, point, spacing)) stamp(q);
        last = point;
      }
      if (travelled >= nextCrumbAt) {
        nextCrumbAt = travelled + CRUMB_EVERY_PX;
        spawnCrumbs(last, 2);
      }
      scheduleCheck();
    };

    // Respaldo para Safari viejo: mientras se raspa, el gesto no mueve la página.
    const onTouchMove = (event: TouchEvent) => {
      if (activePointer !== null) event.preventDefault();
    };
    const onContextMenu = (event: Event) => event.preventDefault();

    const complete = () => {
      if (completed) return;
      completed = true;
      activePointer = null;
      last = null;
      window.clearTimeout(checkTimer);
      checkTimer = 0;
      delete root.dataset.scratching;
      setRevealed(true);
      callbacks.current.onComplete?.();
    };

    const reset = () => {
      completed = false;
      travelled = 0;
      nextCrumbAt = CRUMB_EVERY_PX;
      firstTouch = true;
      maskCtx?.clearRect(0, 0, mask.width, mask.height);
      paintCover();
      callbacks.current.onProgress?.(0);
      setRevealed(false);
      setTouched(false);
    };

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    });

    cover.onload = async () => {
      try {
        await cover.decode();
      } catch {
        // decode() puede fallar en algunos navegadores aunque la imagen cargó.
      }
      if (disposed) return;
      ctx = canvas.getContext("2d");
      if (!ctx || !maskCtx) {
        setPhase("fallback");
        return;
      }
      completeRef.current = complete;
      resetRef.current = reset;
      layout();
      observer.observe(root);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", endStroke);
      canvas.addEventListener("pointercancel", endStroke);
      canvas.addEventListener("lostpointercapture", endStroke);
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("contextmenu", onContextMenu);
      setPhase("ready");
    };
    cover.onerror = () => {
      // Sin tapa no hay juego: se muestra el relleno directamente.
      if (disposed) return;
      setPhase("fallback");
      setRevealed(true);
    };
    cover.src = coverImage;

    return () => {
      disposed = true;
      cover.onload = cover.onerror = null;
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(checkTimer);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointercancel", endStroke);
      canvas.removeEventListener("lostpointercapture", endStroke);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      completeRef.current = () => setRevealed(true);
      resetRef.current = () => setRevealed(false);
    };
  }, [coverImage, fit, focalX, focalY, coverBackdrop, brushSize, completionThreshold, areaKey]);

  const showAll = useCallback(() => completeRef.current(), []);
  const playAgain = useCallback(() => resetRef.current(), []);

  const objectPosition = `${focalX * 100}% ${focalY * 100}%`;

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <div
        ref={rootRef}
        className={styles.stage}
        style={{ aspectRatio, background: coverBackdrop }}
        data-phase={phase}
        data-revealed={revealed}
        role="group"
        aria-label="Descubrí el relleno"
      >
        <Image
          src={revealImage}
          alt={revealAlt}
          fill
          sizes={sizes}
          loading="eager"
          unoptimized={isRemoteImage(revealImage)}
          className={styles.reveal}
          style={{ objectFit: fit, objectPosition }}
        />

        {/* Tapa como imagen mientras carga el canvas, o si el canvas no está disponible. */}
        {phase !== "ready" && (
          // eslint-disable-next-line @next/next/no-img-element -- misma URL que el canvas; se descarta al cargar.
          <img
            src={coverImage}
            alt={coverAlt}
            className={styles.coverImage}
            style={{ objectFit: fit, objectPosition }}
            draggable={false}
          />
        )}

        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <div ref={crumbsRef} className={styles.crumbs} aria-hidden="true" />

        {phase === "ready" && !touched && !revealed && (
          <p className={styles.hint} aria-hidden="true">
            <svg className={styles.hintIcon} viewBox="0 0 24 24">
              <path
                d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.9-2.6L4.3 14.4a1.5 1.5 0 0 1 2.4-1.8L9 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.hintTouch}>Pasá el dedo para descubrir el relleno</span>
            <span className={styles.hintMouse}>Arrastrá el mouse para descubrir el relleno</span>
          </p>
        )}
      </div>

      <div className={styles.actions}>
        {revealed ? (
          phase === "ready" && (
            <button type="button" className={styles.action} onClick={playAgain}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Descubrir otra vez
            </button>
          )
        ) : (
          <button type="button" className={styles.action} onClick={showAll} disabled={phase === "loading"}>
            Ver relleno
          </button>
        )}
      </div>

      <p className={styles.srOnly} role="status">
        {revealed ? "Relleno descubierto." : ""}
      </p>
    </div>
  );
}
