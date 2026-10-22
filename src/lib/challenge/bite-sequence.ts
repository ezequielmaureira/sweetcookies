/**
 * Secuencia de mordidas de una cookie del Sweet Click Challenge (lógica pura,
 * determinista, testeable).
 *
 * Reutiliza la mandíbula de la cookie de la home (biteOutline en
 * components/cookie/bites.ts): misma boca, mismos dientes, mismo borde de miga.
 * Lo nuevo es el plan de 30 mordidas que se come la cookie entera:
 *
 * - Se sigue lo que queda de cookie en una grilla de 100 × 100 celdas
 *   (coordenadas en % del cuadrado de la foto, centro 50/50).
 * - Cada mordida va al sector que más sobresale de lo que queda (mirado desde
 *   su centro), evitando el sector recién mordido: las mordidas se reparten
 *   alrededor y avanzan solas desde el borde hacia el centro.
 * - Cada mordida se lleva ~1/29 de lo que falta (el tamaño se recalcula siempre),
 *   así el ritmo es parejo y no hay saltos.
 * - Pedacitos que quedan sueltos se borran en esa misma mordida y se deshacen
 *   en migas: nunca quedan partes flotando.
 * - La mordida 30 se lleva el último bocado.
 */
import { COOKIE_EDGE, biteOutline, type BiteSpec, type Point } from "../../components/cookie/bites.ts";
import { BITES_PER_COOKIE } from "./scoring.ts";

/** Radio que se sigue en la grilla: algo más que COOKIE_EDGE para cubrir el borde irregular de la foto. */
export const COOKIE_RADIUS = 49.5;
/** Cuánto más chico es el agujero en la capa de miga expuesta (igual criterio que BiteableCookie). */
export const RIM_INSET = 1.6;

const GRID = 100;
const SECTORS = 36;
/** Lo que deja la mordida 29 para el último bocado (fracción de la cookie entera). */
const FINAL_LEFTOVER = 0.03;
/** Un pedazo separado más chico que esto (fracción de la cookie) es una miga suelta: se borra. */
const MIN_PIECE = 0.025;
const CRUMBS_PER_BITE = 5;
const FINAL_CRUMBS = 16;

export type CookieBite = {
  /** Agujero en la foto. */
  outline: readonly Point[];
  /** Agujero más chico en la capa de miga (deja ver el interior en el borde de la mordida). */
  rimOutline: readonly Point[];
  /** Pedacitos que quedaron sueltos: centros de celdas (1 × 1) a borrar en ambas capas. */
  fragments: readonly (readonly Point[])[];
  /** De dónde caen las migas. */
  crumbs: readonly Point[];
  /** Fracción de cookie que queda después de esta mordida (0–1). */
  remaining: number;
  /** Último bocado: la cookie desaparece. */
  final: boolean;
};

export type CookieSequence = readonly CookieBite[];

/* ---------- Ruido determinista (mismo generador que bites.ts) ---------- */

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const angularDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const cellPoint = (cell: number): Point => ({ x: (cell % GRID) + 0.5, y: Math.floor(cell / GRID) + 0.5 });

/* ---------- Grilla ---------- */

function fullCookie(): { grid: Uint8Array; total: number } {
  const grid = new Uint8Array(GRID * GRID);
  let total = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      if (Math.hypot(i + 0.5 - 50, j + 0.5 - 50) < COOKIE_RADIUS) {
        grid[j * GRID + i] = 1;
        total++;
      }
    }
  }
  return { grid, total };
}

function isCookie(grid: Uint8Array, p: Point) {
  const i = Math.floor(p.x);
  const j = Math.floor(p.y);
  return i >= 0 && i < GRID && j >= 0 && j < GRID && grid[j * GRID + i] === 1;
}

/**
 * Celdas de cookie cuyo centro cae dentro del polígono (relleno por líneas).
 * Con `erase` las borra. Devuelve cuántas son.
 */
export function polygonCells(grid: Uint8Array, poly: readonly Point[], erase: boolean): number {
  if (poly.length < 3) return 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const j0 = Math.max(0, Math.floor(minY - 0.5));
  const j1 = Math.min(GRID - 1, Math.ceil(maxY - 0.5));
  const xs: number[] = [];
  let found = 0;
  for (let j = j0; j <= j1; j++) {
    const yc = j + 0.5;
    xs.length = 0;
    for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
      const a = poly[k];
      const b = poly[m];
      if (a.y > yc !== b.y > yc) xs.push(a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      // Centro de la celda (i + 0.5) dentro de [xs[n], xs[n + 1]).
      const i0 = Math.max(0, Math.ceil(xs[n] - 0.5));
      const i1 = Math.min(GRID - 1, Math.ceil(xs[n + 1] - 0.5) - 1);
      for (let i = i0; i <= i1; i++) {
        const cell = j * GRID + i;
        if (grid[cell] !== 1) continue;
        found++;
        if (erase) grid[cell] = 0;
      }
    }
  }
  return found;
}

type Shape = { count: number; cx: number; cy: number; reach: Float64Array };

/** Cuánto queda, su centro y hasta dónde llega en cada sector (visto desde ese centro). */
function measure(grid: Uint8Array): Shape {
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let cell = 0; cell < grid.length; cell++) {
    if (grid[cell] !== 1) continue;
    count++;
    sx += (cell % GRID) + 0.5;
    sy += Math.floor(cell / GRID) + 0.5;
  }
  const cx = count ? sx / count : 50;
  const cy = count ? sy / count : 50;
  const reach = new Float64Array(SECTORS);
  for (let cell = 0; cell < grid.length; cell++) {
    if (grid[cell] !== 1) continue;
    const dx = (cell % GRID) + 0.5 - cx;
    const dy = Math.floor(cell / GRID) + 0.5 - cy;
    const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const s = Math.min(SECTORS - 1, Math.floor(deg / (360 / SECTORS)));
    // +0,5: el borde de la celda, no su centro.
    const r = Math.hypot(dx, dy) + 0.5;
    if (r > reach[s]) reach[s] = r;
  }
  return { count, cx, cy, reach };
}

/** Sectores de mejor a peor: los que más sobresalen, lejos de las últimas dos mordidas. */
function rankSectors(shape: Shape, recent: readonly number[], rand: () => number): number[] {
  const scored: { s: number; score: number }[] = [];
  for (let s = 0; s < SECTORS; s++) {
    if (shape.reach[s] <= 0) continue;
    const angle = ((s + 0.5) * 360) / SECTORS;
    let score = shape.reach[s] * (0.85 + rand() * 0.3);
    recent.forEach((previous, age) => {
      const distance = angularDistance(angle, previous);
      if (distance < 70) score -= (70 - distance) * (age === 0 ? 0.3 : 0.14);
    });
    scored.push({ s, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.s);
}

type Plan = { spec: BiteSpec; angle: number; dx: number; dy: number; outline: Point[] };

const shift = (points: readonly Point[], dx: number, dy: number) => points.map((p) => ({ x: p.x + dx, y: p.y + dy }));

/**
 * Mandíbula en el sector `s`. biteOutline mide desde el centro de la foto
 * (50/50); el resultado se traslada al centro de lo que queda.
 */
function planBite(shape: Shape, s: number, target: number, rand: () => number): Plan {
  const reach = shape.reach[s];
  const angle = ((s + 0.15 + rand() * 0.7) * 360) / SECTORS;
  // Boca de tamaño razonable para lo que queda; la profundidad sale del área buscada.
  const width = clamp(reach * 0.5, 6, 19) * (0.9 + rand() * 0.2);
  const thickness = clamp(target / (1.3 * width), 2.5, Math.max(3, reach * 0.95));
  const spec: BiteSpec = {
    angle,
    depth: COOKIE_EDGE - (reach - thickness),
    width,
    // El centro de la mandíbula queda apenas afuera de la cookie: arco de mordida, no un círculo.
    height: thickness + 3 + rand() * 3,
    skew: (rand() - 0.5) * 14,
    teeth: clamp(Math.round(width / 4), 4, 7),
    seed: Math.floor(rand() * 2 ** 31),
  };
  const dx = shape.cx - 50;
  const dy = shape.cy - 50;
  return { spec, angle, dx, dy, outline: shift(biteOutline(spec), dx, dy) };
}

/** Borra los pedazos separados del principal que son muy chicos. Devuelve cada uno como celdas. */
function dropLoosePieces(grid: Uint8Array, total: number): number[][] {
  const seen = new Uint8Array(grid.length);
  const queue = new Int32Array(grid.length);
  const pieces: number[][] = [];
  for (let start = 0; start < grid.length; start++) {
    if (grid[start] !== 1 || seen[start]) continue;
    const cells: number[] = [];
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const cell = queue[head++];
      cells.push(cell);
      const i = cell % GRID;
      const neighbors = [i > 0 ? cell - 1 : -1, i < GRID - 1 ? cell + 1 : -1, cell - GRID, cell + GRID];
      for (const n of neighbors) {
        if (n < 0 || n >= grid.length || seen[n] || grid[n] !== 1) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    pieces.push(cells);
  }
  if (pieces.length < 2) return [];
  const largest = pieces.reduce((a, b) => (b.length > a.length ? b : a));
  const loose = pieces.filter((piece) => piece !== largest && piece.length < total * MIN_PIECE);
  for (const piece of loose) for (const cell of piece) grid[cell] = 0;
  return loose;
}

function sample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor(((i + 0.5) / count) * items.length)]);
}

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Plan completo de una cookie: BITES_PER_COOKIE mordidas, la última es el bocado final. */
export function createCookieSequence(seed: number): CookieSequence {
  const rand = random(seed);
  const { grid, total } = fullCookie();
  const leftover = total * FINAL_LEFTOVER;
  const recent: number[] = [];
  const bites: CookieBite[] = [];
  const regular = BITES_PER_COOKIE - 1;

  for (let k = 0; k < regular; k++) {
    const shape = measure(grid);
    if (shape.count === 0) {
      bites.push({ outline: [], rimOutline: [], fragments: [], crumbs: [], remaining: 0, final: false });
      continue;
    }
    const target = Math.max(6, (shape.count - leftover) / (regular - k));

    // Hasta tres sectores candidatos: se queda con el primero que muerde lo suficiente.
    let best: (Plan & { cells: number }) | null = null;
    for (const s of rankSectors(shape, recent, rand).slice(0, 3)) {
      const plan = planBite(shape, s, target, rand);
      const cells = polygonCells(grid, plan.outline, false);
      if (!best || cells > best.cells) best = { ...plan, cells };
      if (cells >= target * 0.3) break;
    }
    if (!best) break;

    const crumbs = sample(best.outline.filter((p) => isCookie(grid, p)), CRUMBS_PER_BITE);
    polygonCells(grid, best.outline, true);
    const loose = dropLoosePieces(grid, total).map((piece) => piece.map(cellPoint));
    for (const piece of loose) crumbs.push(centroid(piece));

    recent.unshift(best.angle);
    recent.length = Math.min(recent.length, 2);

    bites.push({
      outline: best.outline,
      rimOutline: shift(biteOutline(best.spec, RIM_INSET, 1.1), best.dx, best.dy),
      fragments: loose,
      crumbs,
      remaining: measure(grid).count / total,
      final: false,
    });
  }

  // Último bocado: lo que queda se va entero, en una lluvia de migas.
  const rest: Point[] = [];
  for (let cell = 0; cell < grid.length; cell++) if (grid[cell] === 1) rest.push(cellPoint(cell));
  bites.push({
    outline: [],
    rimOutline: [],
    fragments: [],
    crumbs: rest.length ? sample(rest, FINAL_CRUMBS) : [{ x: 50, y: 50 }],
    remaining: 0,
    final: true,
  });
  return bites;
}

/* ---------- Variantes (se calculan una vez y se reutilizan) ---------- */

const VARIANT_SEEDS = [1103, 2207, 3301, 4409, 5503] as const;
/** Cookies distintas antes de repetir el dibujo de mordidas. */
export const SEQUENCE_VARIANTS = VARIANT_SEEDS.length;
const pool: (CookieSequence | undefined)[] = [];

/** Secuencia de la cookie número `cookieIndex` de la partida (0, 1, 2…). */
export function sequenceFor(cookieIndex: number): CookieSequence {
  const variant = ((cookieIndex % SEQUENCE_VARIANTS) + SEQUENCE_VARIANTS) % SEQUENCE_VARIANTS;
  return (pool[variant] ??= createCookieSequence(VARIANT_SEEDS[variant]));
}
