/**
 * Dibujo de la cookie del juego en Canvas 2D (solo navegador).
 *
 * Dos lienzos apilados con la MISMA foto real:
 *   - miga (abajo): la foto apenas más clara y cálida = interior de la cookie.
 *   - cookie (arriba): la foto tal cual.
 * Cada mordida borra (destination-out) un polígono en cada lienzo; en la miga el
 * agujero es un poco más chico, así asoma el interior en el borde mordido.
 * Morder cuesta siempre lo mismo (un polígono), sin importar cuántas mordidas
 * lleve: nunca se vuelve a dibujar la foto entera salvo al empezar otra cookie
 * o si cambia el tamaño de pantalla.
 */
import type { CookieBite, CookieSequence } from "./bite-sequence";

/** Tinte de la capa de miga: masa dorada pálida, más clara que la corteza. */
const RIM_TINT = "rgba(255, 228, 184, 0.24)";
/** Radio con que se borran los pedacitos sueltos (celdas de 1 × 1, con margen). */
const FRAGMENT_RADIUS = 1;
/** Foto cenital sin recorte: se recorta en círculo a este radio (en % del lado). */
const ROUND_PHOTO_RADIUS = 48;

export class CookieRenderer {
  private readonly cookie: CanvasRenderingContext2D | null;
  private readonly rim: CanvasRenderingContext2D | null;
  private readonly image: CanvasImageSource;
  private readonly isCutout: boolean;
  private size = 0;
  private sequence: CookieSequence = [];
  private applied = 0;

  constructor(cookieCanvas: HTMLCanvasElement, rimCanvas: HTMLCanvasElement, image: CanvasImageSource, isCutout: boolean) {
    this.cookie = cookieCanvas.getContext("2d");
    this.rim = rimCanvas.getContext("2d");
    this.image = image;
    this.isCutout = isCutout;
  }

  /** Tamaño en px CSS del escenario; el lienzo usa hasta 2× de densidad. */
  resize(cssSize: number, dpr: number) {
    const px = Math.max(1, Math.round(cssSize * Math.min(dpr, 2)));
    if (px === this.size) return;
    this.size = px;
    for (const ctx of [this.cookie, this.rim]) {
      if (!ctx) continue;
      ctx.canvas.width = px;
      ctx.canvas.height = px;
    }
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
    if (!this.size) return;
    this.paint(this.cookie, false);
    this.paint(this.rim, true);
    // Tras un cambio de tamaño se repiten las mordidas ya dadas (polígonos, es instantáneo).
    for (let i = 0; i < this.applied && i < this.sequence.length; i++) this.apply(this.sequence[i]);
  }

  private paint(ctx: CanvasRenderingContext2D | null, tint: boolean) {
    if (!ctx) return;
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
    if (tint) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = RIM_TINT;
      ctx.fillRect(0, 0, 100, 100);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private apply(bite: CookieBite) {
    if (bite.final) {
      for (const ctx of [this.cookie, this.rim]) {
        if (!ctx) continue;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.size, this.size);
      }
      return;
    }
    this.erase(this.cookie, bite.outline, bite.fragments);
    this.erase(this.rim, bite.rimOutline, bite.fragments);
  }

  private erase(ctx: CanvasRenderingContext2D | null, outline: CookieBite["outline"], fragments: CookieBite["fragments"]) {
    if (!ctx || !this.size) return;
    const s = this.size / 100;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    if (outline.length > 2) {
      ctx.moveTo(outline[0].x, outline[0].y);
      for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
      ctx.closePath();
    }
    for (const piece of fragments) {
      for (const p of piece) {
        ctx.moveTo(p.x + FRAGMENT_RADIUS, p.y);
        ctx.arc(p.x, p.y, FRAGMENT_RADIUS, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
}
