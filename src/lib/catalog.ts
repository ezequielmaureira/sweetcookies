/**
 * Catálogo del comprador (lógica pura, servidor y cliente).
 *
 * Fuente única: PostgreSQL → GET /api/public/products (backend en Fly). El
 * admin y la web leen los mismos productos; este tipo nunca trae costos ni
 * ganancias. El dinero viaja como string decimal ("5000.00") y se opera en
 * centavos enteros para no arrastrar errores de coma flotante.
 */
export type Product = {
  id: string;
  name: string;
  description: string | null;
  /** Precio de venta, string decimal con 2 decimales. */
  price: string;
  stock: number;
  /** Ruta del sitio (/images/...) o URL https. */
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

/** Imagen externa (https): se muestra sin el optimizador de Next (no hay dominios configurados). */
export const isRemoteImage = (src: string) => /^https:\/\//.test(src);

const ID = /^[\w-]{1,40}$/;

/** Valida la respuesta de la API; productos mal formados se descartan. null = respuesta inválida. */
export function parseCatalog(data: unknown): Product[] | null {
  const list = (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) return null;
  return list.flatMap((raw): Product[] => {
    const p = raw as Record<string, unknown>;
    if (typeof p?.id !== "string" || !ID.test(p.id) || typeof p.name !== "string" || typeof p.price !== "string") return [];
    if (toCents(p.price) <= 0 || typeof p.stock !== "number" || !Number.isInteger(p.stock) || p.stock <= 0) return [];
    const imageUrl = typeof p.imageUrl === "string" && (p.imageUrl.startsWith("/") || isRemoteImage(p.imageUrl)) ? p.imageUrl : null;
    return [
      {
        id: p.id,
        name: p.name,
        description: typeof p.description === "string" ? p.description : null,
        price: p.price,
        stock: p.stock,
        imageUrl,
        category: typeof p.category === "string" ? p.category : null,
        featured: p.featured === true,
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
