/**
 * Dibujo de la cookie del juego en Canvas 2D (solo navegador).
 *
 * UN solo lienzo con la foto real. Cada mordida:
 *   1. borra el polígono con destination-out: el agujero queda TRANSPARENTE y
 *      se ve el fondo chocolate (no hay ninguna otra capa de foto debajo);
 *   2. pinta el borde nuevo con source-atop (solo cae sobre la cookie que
 *      queda): una franja fina de miga dorada con una sombra apenas más oscura.
 * Morder cuesta siempre lo mismo (un polígono); la foto entera solo se vuelve a
 * dibujar al empezar otra cookie o si cambia el tamaño de pantalla.
 */
import type { CookieBite, CookieSequence } from "./bite-sequence";

/** Borde mordido, en unidades de la cookie (0–100). Media línea cae en el agujero y no se ve. */
const EDGE_SHADOW = { color: "rgba(74, 40, 20, 0.45)", width: 2.6 };
const EDGE_CRUMB = { color: "rgba(236, 196, 138, 0.92)", width: 1.4 };
/** Radio con que se borran los pedacitos sueltos (celdas de 1 × 1, con margen). */
const FRAGMENT_RADIUS = 1;
/** Foto cenital sin recorte: se recorta en círculo a este radio (en % del lado). */
const ROUND_PHOTO_RADIUS = 48;

export class CookieRenderer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly image: CanvasImageSource;
  private readonly isCutout: boolean;
  private size = 0;
  private sequence: CookieSequence = [];
  private applied = 0;

  constructor(canvas: HTMLCanvasElement, image: CanvasImageSource, isCutout: boolean) {
    this.ctx = canvas.getContext("2d");
    this.image = image;
    this.isCutout = isCutout;
  }

  /** Tamaño en px CSS del escenario; el lienzo usa hasta 2× de densidad. */
  resize(cssSize: number, dpr: number) {
    const px = Math.max(1, Math.round(cssSize * Math.min(dpr, 2)));
    if (!this.ctx || px === this.size) return;
    this.size = px;
    this.ctx.canvas.width = px;
    this.ctx.canvas.height = px;
    this.redraw();
  }

  /** Cookie nueva, entera. */
  reset(sequence: CookieSequence) {
    this.sequence = sequence;
    this.applied = 0;
    this.redraw();
  }

  /** Aplica la siguiente mordida de la secuencia actual. */
  bite(bite: CookieBite) {
    this.applied++;
    this.apply(bite);
  }

  private redraw() {
    const ctx = this.ctx;
    if (!ctx || !this.size) return;
    const s = this.size / 100;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (this.isCutout) {
      ctx.drawImage(this.image, 0, 0, 100, 100);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(50, 50, ROUND_PHOTO_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.image, 0, 0, 100, 100);
      ctx.restore();
    }
    // Tras un cambio de tamaño se repiten las mordidas ya dadas (polígonos, es instantáneo).
    for (let i = 0; i < this.applied && i < this.sequence.length; i++) this.apply(this.sequence[i]);
  }

  private apply(bite: CookieBite) {
    const ctx = this.ctx;
    if (!ctx || !this.size) return;
    if (bite.final) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.size, this.size);
      return;
    }
    const s = this.size / 100;
    ctx.setTransform(s, 0, 0, s, 0, 0);

    // 1. Agujero real.
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    const hasOutline = bite.outline.length > 2;
    if (hasOutline) this.trace(bite.outline);
    for (const piece of bite.fragments) {
      for (const p of piece) {
        ctx.moveTo(p.x + FRAGMENT_RADIUS, p.y);
        ctx.arc(p.x, p.y, FRAGMENT_RADIUS, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // 2. Miga expuesta: franja fina en el borde nuevo, solo sobre la cookie que queda.
    if (hasOutline) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.lineJoin = "round";
      ctx.beginPath();
      this.trace(bite.outline);
      ctx.strokeStyle = EDGE_SHADOW.color;
      ctx.lineWidth = EDGE_SHADOW.width;
      ctx.stroke();
      ctx.strokeStyle = EDGE_CRUMB.color;
      ctx.lineWidth = EDGE_CRUMB.width;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private trace(outline: CookieBite["outline"]) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
    ctx.closePath();
  }
}
