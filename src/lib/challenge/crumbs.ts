/**
 * Migas del juego: partículas en un único Canvas 2D (solo navegador).
 *
 * Pool fijo de partículas (sin nodos DOM ni objetos nuevos por mordida); se
 * mueven y dibujan desde el mismo requestAnimationFrame del juego, y cuando no
 * queda ninguna viva el lienzo deja de redibujarse.
 *
 * Coordenadas en unidades de la cookie (0–100). El lienzo la cubre con margen
 * (CRUMB_AREA) para que las migas puedan caer por debajo.
 */
import type { Point } from "@/components/cookie/bites";

export const CRUMB_AREA = { left: -20, top: -20, width: 140, height: 160 } as const;

const MAX_CRUMBS = 110;
const GRAVITY = 260;
const FADE_S = 0.25;
/** Tonos tomados de la cookie real: masa dorada, corteza tostada y chips. */
const COLORS = ["#d8a868", "#c99355", "#b77a3e", "#8a5528", "#4a2a1a"];
const SHAPES = 6;

type Crumb = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  life: number;
  color: string;
  shape: number;
};

/** Contorno irregular de radio ~1 (nada de círculos perfectos). */
function crumbPath(): Path2D {
  const corners = 5 + Math.floor(Math.random() * 3);
  const path = new Path2D();
  for (let i = 0; i < corners; i++) {
    const a = (i / corners) * Math.PI * 2 + Math.random() * 0.5;
    const r = 0.7 + Math.random() * 0.35;
    if (i === 0) path.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else path.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  path.closePath();
  return path;
}

export class CrumbField {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly shapes: Path2D[];
  private readonly pool: Crumb[] = [];
  private cursor = 0;
  private scale = 1;
  private last = 0;
  private dirty = false;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.shapes = Array.from({ length: SHAPES }, crumbPath);
  }

  /** Mismo tamaño CSS que el escenario de la cookie; densidad limitada (son partículas chicas). */
  resize(cssSize: number, dpr: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const ratio = Math.min(dpr, 1.5);
    const width = Math.max(1, Math.round(((cssSize * CRUMB_AREA.width) / 100) * ratio));
    const height = Math.max(1, Math.round(((cssSize * CRUMB_AREA.height) / 100) * ratio));
    if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
      ctx.canvas.width = width;
      ctx.canvas.height = height;
    }
    this.scale = width / CRUMB_AREA.width;
  }

  /** "bite": unas pocas migas que caen del borde mordido. "burst": la cookie se terminó. */
  spawn(origins: readonly Point[], kind: "bite" | "burst") {
    if (!this.ctx || origins.length === 0) return;
    const count = kind === "burst" ? 36 : 7;
    for (let k = 0; k < count; k++) {
      const o = origins[k % origins.length];
      const c = this.take();
      c.x = o.x + (Math.random() - 0.5) * 2;
      c.y = o.y + (Math.random() - 0.5) * 2;
      if (kind === "burst") {
        const a = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 85;
        c.vx = Math.cos(a) * speed;
        c.vy = Math.sin(a) * speed - 40;
        c.life = 0.8 + Math.random() * 0.5;
        c.size = 0.8 + Math.random() * 1.6;
      } else {
        // Se desprenden hacia afuera de la cookie, saltan apenas y caen.
        const dx = o.x - 50;
        const dy = o.y - 50;
        const len = Math.hypot(dx, dy) || 1;
        const speed = 12 + Math.random() * 30;
        c.vx = (dx / len) * speed + (Math.random() - 0.5) * 16;
        c.vy = (dy / len) * speed * 0.5 - (15 + Math.random() * 35);
        c.life = 0.55 + Math.random() * 0.45;
        c.size = 0.6 + Math.random() * 1.1;
      }
      c.angle = Math.random() * Math.PI * 2;
      c.spin = (Math.random() - 0.5) * 12;
      c.color = COLORS[Math.random() < 0.2 ? 4 : Math.floor(Math.random() * 4)];
      c.shape = Math.floor(Math.random() * SHAPES);
    }
    this.dirty = true;
  }

  /** Avanza y dibuja. Se llama en cada cuadro; sin migas vivas no hace nada. */
  step(now: number) {
    const ctx = this.ctx;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!ctx || !this.dirty) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const s = this.scale;
    let alive = 0;
    for (const c of this.pool) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) continue;
      alive++;
      c.vy += GRAVITY * dt;
      c.vx *= 0.99;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle += c.spin * dt;
      const k = s * c.size;
      const cos = Math.cos(c.angle) * k;
      const sin = Math.sin(c.angle) * k;
      ctx.globalAlpha = Math.min(1, c.life / FADE_S);
      ctx.setTransform(cos, sin, -sin, cos, (c.x - CRUMB_AREA.left) * s, (c.y - CRUMB_AREA.top) * s);
      ctx.fillStyle = c.color;
      ctx.fill(this.shapes[c.shape]);
    }
    ctx.globalAlpha = 1;
    this.dirty = alive > 0;
  }

  private take(): Crumb {
    if (this.pool.length < MAX_CRUMBS) {
      const fresh: Crumb = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, size: 1, life: 0, color: COLORS[0], shape: 0 };
      this.pool.push(fresh);
      return fresh;
    }
    // Pool lleno: se recicla la miga más vieja.
    const reused = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_CRUMBS;
    return reused;
  }
}
