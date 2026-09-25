/**
 * Geometría de las mordidas (pura, testeable).
 * Coordenadas en % del cuadrado que contiene la cookie (0–100).
 */
export type Circle = { x: number; y: number; r: number };

/** Mordida: centro fuera/sobre el borde + "dientes" alrededor para un borde irregular. */
type BiteSpec = { angle: number; distance: number; radius: number };

/**
 * 3 mordidas: dos normales y una grande que la deja casi terminada.
 * Ajustadas a la foto real (hero-cookie-cutout.png, Red Velvet): el borde de la
 * cookie queda a ~47–48 % del centro, así que cada centro cae sobre/fuera del
 * borde y los dientes no tocan los trozos grandes de chocolate blanco.
 */
export const BITES: readonly BiteSpec[] = [
  { angle: -40, distance: 51, radius: 18 },
  { angle: 132, distance: 50, radius: 20 },
  { angle: 40, distance: 48, radius: 27 },
];

export const BITE_COUNT = BITES.length;

export const DEFAULT_MESSAGES = ["Mmm...", "Una más.", "Bueno... ahora sí."] as const;

function toXY(angleDeg: number, distance: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + Math.cos(rad) * distance, y: 50 + Math.sin(rad) * distance };
}

/**
 * Círculos de una mordida: un núcleo + un anillo de 7 círculos superpuestos.
 * La unión da un contorno festoneado continuo (marcas de dientes) sin
 * "islas" sueltas. Radios/distancias levemente irregulares y deterministas.
 */
export function biteCircles(spec: BiteSpec, shrink = 0): Circle[] {
  const center = toXY(spec.angle, spec.distance);
  const R = spec.radius;
  const core: Circle = { ...center, r: Math.max(0, R * 0.78 - shrink) };
  const jitter = [0, 0.05, -0.04, 0.03, -0.05, 0.04, -0.02];
  const teeth: Circle[] = jitter.map((j, i) => {
    const a = ((i / jitter.length) * 360 + spec.angle * 1.3) * (Math.PI / 180);
    const d = R * (0.6 + j);
    return {
      x: center.x + Math.cos(a) * d,
      y: center.y + Math.sin(a) * d,
      r: Math.max(0, R * (0.42 - j * 0.6) - shrink),
    };
  });
  return [core, ...teeth];
}

/** Valor CSS de mask-image con los agujeros de las primeras `count` mordidas. */
export function biteMask(count: number, shrink = 0): string | undefined {
  const holes = BITES.slice(0, count).flatMap((spec) => biteCircles(spec, shrink));
  if (holes.length === 0) return undefined;
  const layers = holes.map(
    ({ x, y, r }) => `radial-gradient(ellipse ${r.toFixed(2)}% ${r.toFixed(2)}% at ${x.toFixed(2)}% ${y.toFixed(2)}%, transparent 96%, #000 100%)`,
  );
  return [...layers, "linear-gradient(#000, #000)"].join(", ");
}

/** Punto del borde de la mordida (para las miguitas). */
export function bitePoint(index: number) {
  const spec = BITES[index];
  return toXY(spec.angle, Math.min(46, spec.distance - spec.radius * 0.6));
}
