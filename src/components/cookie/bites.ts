/**
 * Geometría de las mordidas (pura, determinista, testeable).
 *
 * Coordenadas en % del cuadrado que contiene la cookie (0–100, centro 50/50).
 * Ajustada a la foto public/images/cookies/hero-cookie-cutout.png (cookie
 * clásica con chips): el borde de la cookie queda a ~47 % del centro.
 *
 * Cada mordida es el arco de una mandíbula (no un círculo): una curva ancha
 * con ondulación suave, marcas de dientes de tamaño desigual y un borde
 * de miga irregular. Se dibuja como polígono en una máscara SVG.
 */
export type Point = { x: number; y: number };

export type BiteSpec = {
  /** Dirección (grados, 0 = derecha, 90 = abajo) del punto del borde mordido. */
  angle: number;
  /** Cuánto entra la mordida desde el borde hacia el centro. */
  depth: number;
  /** Semiancho de la mandíbula (a lo largo del borde). */
  width: number;
  /** Semialto de la mandíbula (hacia afuera de la cookie). */
  height: number;
  /** Inclinación de la mandíbula respecto del borde: evita mordidas "de frente". */
  skew: number;
  /** Cantidad de marcas de dientes en el arco interno. */
  teeth: number;
  seed: number;
};

/** Radio aproximado del borde de la cookie en la foto. */
export const COOKIE_EDGE = 47;

/** Una mordida = una o más mandíbulas (el bocado final son varias seguidas). */
export type BiteStep = readonly BiteSpec[];

/**
 * 4 mordidas progresivas, en zonas del borde con masa (sin chips):
 * 1ª chica arriba a la derecha → 2ª algo mayor abajo a la izquierda →
 * 3ª marcada a la derecha (se une con la 1ª) → 4ª: bocado final de tres
 * mandíbulas de tamaño normal. Su corte sigue un camino de masa entre las
 * columnas de chips, así el pedazo que queda conserva los chips enteros.
 */
export const BITES: readonly BiteStep[] = [
  [{ angle: -40, depth: 9, width: 13, height: 16, skew: 3, teeth: 4, seed: 19 }],
  [{ angle: 140, depth: 12, width: 16, height: 19, skew: -4, teeth: 5, seed: 29 }],
  [{ angle: -12, depth: 17, width: 21, height: 25, skew: -3, teeth: 6, seed: 47 }],
  [
    { angle: -50, depth: 29, width: 24, height: 38, skew: -8, teeth: 6, seed: 83 },
    { angle: -6, depth: 42, width: 26, height: 34, skew: 4, teeth: 7, seed: 97 },
    { angle: 46, depth: 25, width: 25, height: 30, skew: 5, teeth: 6, seed: 131 },
  ],
];

export const BITE_COUNT = BITES.length;

export const DEFAULT_MESSAGES = ["Mmm...", "Una más.", "Ya casi.", "Bueno... no quedó nada."] as const;

export type BiteMessages = readonly [string, string, string, string];

/* ---------- Ruido determinista ---------- */

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

const SAMPLES = 150;

/**
 * Contorno del agujero de una mordida. `inset` achica el agujero (capa de miga
 * expuesta) y `grain` controla lo desparejo del borde.
 */
export function biteOutline(spec: BiteSpec, inset = 0, grain = 0.5): Point[] {
  const rand = random(spec.seed);
  const dir = (spec.angle * Math.PI) / 180;
  const n = { x: Math.cos(dir), y: Math.sin(dir) };
  const center = {
    x: 50 + n.x * (COOKIE_EDGE - spec.depth + spec.height),
    y: 50 + n.y * (COOKIE_EDGE - spec.depth + spec.height),
  };
  const rot = dir + (spec.skew * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // Ondulación suave: la mandíbula nunca es un arco perfecto.
  const waves = [1, 2, 3].map((k) => ({ k, phase: rand() * Math.PI * 2, amp: (0.05 / k) * (0.6 + rand() * 0.8) }));

  // Dientes con ancho y profundidad desiguales a lo largo del arco interno.
  const cuts = [0];
  for (let i = 1; i < spec.teeth; i++) cuts.push((i + (rand() - 0.5) * 0.55) / spec.teeth);
  cuts.push(1);
  // Mismo tamaño de dientes en todas las mordidas (es la misma boca), con variación.
  const toothAmp = cuts.slice(1).map(() => 0.85 + rand() * 0.8);

  // Borde de miga: ruido fino suavizado entre vecinos (sin picos aislados).
  const rawGrain = Array.from({ length: SAMPLES }, () => rand() - 0.5);
  const at = (i: number) => rawGrain[(i + SAMPLES) % SAMPLES];
  const crumb = rawGrain.map((v, i) => (v * 3 + (at(i - 1) + at(i + 1)) * 2 + at(i - 2) + at(i + 2)) / 9);
  const insetNoise = Array.from({ length: SAMPLES }, () => rand());

  const points: Point[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2;
    // Local: u a lo largo del borde, v hacia afuera. El lado interno es v < 0.
    let u = Math.cos(t) * spec.width;
    let v = Math.sin(t) * spec.height;
    let push = waves.reduce((acc, w) => acc + w.amp * Math.sin(w.k * t + w.phase), 0) * spec.height;

    if (v < 0) {
      // s: 0→1 recorriendo el arco interno (donde están los dientes).
      const s = (t - Math.PI) / Math.PI;
      let tooth = 0;
      for (let j = 0; j < cuts.length - 1; j++) {
        if (s >= cuts[j] && s <= cuts[j + 1]) {
          const local = (s - cuts[j]) / (cuts[j + 1] - cuts[j]);
          // Exponente > 1: marcas redondeadas, sin puntas de serrucho entre dientes.
          tooth = toothAmp[j] * Math.pow(Math.sin(Math.PI * local), 1.3);
        }
      }
      // Los dientes marcan más en el centro del arco, pero nunca desaparecen (sin tramos rectos).
      const weight = 0.45 + 0.55 * Math.sin(Math.PI * s);
      push += tooth * weight + crumb[i] * grain * 2;
      push -= inset * (0.75 + insetNoise[i] * 0.5);
    }

    const len = Math.hypot(u, v) || 1;
    u += (u / len) * push;
    v += (v / len) * push;
    // v positivo = hacia afuera de la cookie.
    points.push({ x: center.x - u * sin + v * cos, y: center.y + u * cos + v * sin });
  }
  return points;
}

function pathOf(points: Point[]) {
  return `M${points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("L")}Z`;
}

/**
 * mask-image (SVG) con los agujeros de las primeras `count` mordidas.
 * `inset` > 0 genera la capa de miga expuesta: agujeros un poco más chicos y
 * más desparejos, que asoman como borde interno de cada mordida.
 */
export function biteMask(count: number, inset = 0): string | undefined {
  if (count <= 0) return undefined;
  const holes = BITES.slice(0, count)
    .flat()
    .map((spec) => `<path d='${pathOf(biteOutline(spec, inset, inset > 0 ? 1.1 : 0.5))}'/>`)
    .join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>` +
    `<mask id='m'><rect width='100' height='100' fill='white'/><g fill='black'>${holes}</g></mask>` +
    `<rect width='100' height='100' mask='url(#m)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Puntos del borde recién mordido (dentro de la cookie), de donde caen las migas. */
export function crumbOrigins(index: number, count: number): Point[] {
  const inside = BITES[index]
    .flatMap((spec) => biteOutline(spec))
    .filter((p) => Math.hypot(p.x - 50, p.y - 50) < COOKIE_EDGE - 1.5);
  if (inside.length === 0) return [];
  return Array.from({ length: count }, (_, i) => inside[Math.floor(((i + 0.5) / count) * inside.length)]);
}
