/**
 * Catálogo del comprador (lógica pura, servidor y cliente).
 *
 * Fuente única: PostgreSQL → GET /api/public/products (backend en Fly). El
 * admin y la web leen los mismos productos; este tipo nunca trae costos ni
 * ganancias. El dinero viaja como string decimal ("5000.00") y se opera en
 * centavos enteros para no arrastrar errores de coma flotante.
 */
import { API_URL } from "./api.ts";

/**
 * Vista en caja (ver src/lib/box-view.ts). Prioridad: boxImageUrl si existe;
 * si no, imageUrl encuadrada con zoom / punto central / rotación.
 */
export type BoxView = {
  boxImageUrl: string | null;
  boxImageScale: number;
  boxImageX: number;
  boxImageY: number;
  boxImageRotation: number;
};

export const DEFAULT_BOX_VIEW: BoxView = { boxImageUrl: null, boxImageScale: 1, boxImageX: 50, boxImageY: 50, boxImageRotation: 0 };

export type Product = BoxView & {
  id: string;
  name: string;
  description: string | null;
  /** Precio de venta, string decimal con 2 decimales. */
  price: string;
  stock: number;
  /** Foto principal (catálogo, cards): ruta del sitio, imagen subida (/api/public/images/…) o URL https. */
  imageUrl: string | null;
  category: string | null;
  featured: boolean;
};

export const PUBLIC_PRODUCTS_PATH = "/api/public/products";

/** "5000.50" → 500050. Valores inválidos → 0. */
export function toCents(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return 0;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

const formatters = new Map<number, Intl.NumberFormat>();

/** Centavos → "$ 5.000" o "$ 5.000,50" (pesos argentinos). */
export function formatCents(cents: number): string {
  const digits = cents % 100 === 0 ? 0 : 2;
  let formatter = formatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, formatter);
  }
  return formatter.format(cents / 100);
}

export const formatPrice = (value: string) => formatCents(toCents(value));

export function productAlt(product: Pick<Product, "name">): string {
  return `Cookie ${product.name} de Sweet Cookies`;
}

/** Imagen con URL absoluta (API o externa): se muestra sin el optimizador de Next. */
export const isRemoteImage = (src: string) => /^https?:\/\//.test(src);

/** Imágenes subidas desde el panel: viven en la API, no en el sitio. */
const UPLOADED = /^\/api\/public\/images\/[a-z0-9]{10,40}$/;

/** Ruta guardada → src usable en <img>. Las subidas se sirven desde la API. */
export function resolveImageSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (UPLOADED.test(src)) return API_URL ? `${API_URL}${src}` : null;
  return src;
}

/** Acepta rutas del sitio, imágenes subidas o https (nunca javascript:, data:, etc.). */
const safeImage = (value: unknown) => (typeof value === "string" && (value.startsWith("/") || /^https:\/\//.test(value)) && !value.startsWith("//") ? value : null);

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const ID = /^[\w-]{1,40}$/;

/** Valida la respuesta de la API; productos mal formados se descartan. null = respuesta inválida. */
export function parseCatalog(data: unknown): Product[] | null {
  const list = (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) return null;
  return list.flatMap((raw): Product[] => {
    const p = raw as Record<string, unknown>;
    if (typeof p?.id !== "string" || !ID.test(p.id) || typeof p.name !== "string" || typeof p.price !== "string") return [];
    if (toCents(p.price) <= 0 || typeof p.stock !== "number" || !Number.isInteger(p.stock) || p.stock <= 0) return [];
    return [
      {
        id: p.id,
        name: p.name,
        description: typeof p.description === "string" ? p.description : null,
        price: p.price,
        stock: p.stock,
        imageUrl: safeImage(p.imageUrl),
        category: typeof p.category === "string" ? p.category : null,
        featured: p.featured === true,
        boxImageUrl: safeImage(p.boxImageUrl),
        boxImageScale: clamp(p.boxImageScale, 1, 4, 1),
        boxImageX: clamp(p.boxImageX, 0, 100, 50),
        boxImageY: clamp(p.boxImageY, 0, 100, 50),
        boxImageRotation: clamp(p.boxImageRotation, -180, 180, 0),
      },
    ];
  });
}

/** Aviso de disponibilidad cuando quedan pocas unidades. */
export function availabilityLabel(stock: number): string | null {
  if (stock <= 0) return "Sin stock";
  if (stock <= 5) return stock === 1 ? "¡Queda 1!" : `Quedan ${stock}`;
  return null;
}
