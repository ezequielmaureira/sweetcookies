/**
 * Catálogo de sabores.
 *
 * Estructura pensada para crecer (constructor de caja, carrito, catálogo
 * administrable): cada sabor tiene un `id` estable que usa el carrito.
 *
 * - `image` es el nombre base del archivo dentro de /public/images/cookies/.
 *   Se aceptan .jpg, .jpeg, .png, .webp y .avif (ver src/lib/images.ts).
 * - `description` es opcional: completar solo con información real.
 * - `price` queda en null hasta tener precios reales; la UI no lo muestra.
 */
export type Flavor = {
  id: string;
  name: string;
  description?: string;
  image: string;
  alt: string;
  price: number | null;
  available: boolean;
};

export const flavors: Flavor[] = [
  {
    id: "cookies-cream",
    name: "Cookies & Cream",
    image: "cookies-cream",
    alt: "Cookie Cookies & Cream de Sweet Cookies",
    price: null,
    available: true,
  },
  {
    id: "red-velvet",
    name: "Red Velvet",
    image: "red-velvet",
    alt: "Cookie Red Velvet de Sweet Cookies",
    price: null,
    available: true,
  },
  {
    id: "pistacho",
    name: "Pistacho",
    description: "Chocolate blanco + pistacho",
    image: "pistacho",
    alt: "Cookie de pistacho con chocolate blanco de Sweet Cookies",
    price: null,
    available: true,
  },
  {
    id: "limon-frambuesa",
    name: "Limón & Frambuesa",
    image: "limon-frambuesa",
    alt: "Cookie de limón y frambuesa de Sweet Cookies",
    price: null,
    available: true,
  },
  {
    id: "chocotorta",
    name: "Chocotorta",
    image: "chocotorta",
    alt: "Cookie Chocotorta de Sweet Cookies",
    price: null,
    available: true,
  },
  {
    id: "franui",
    name: "Estilo Franui",
    image: "franui",
    alt: "Cookie estilo Franui de Sweet Cookies",
    price: null,
    available: true,
  },
];

export const flavorsById: Record<string, Flavor> = Object.fromEntries(
  flavors.map((flavor) => [flavor.id, flavor]),
);

/** Imágenes de marca (mismo directorio que las cookies). */
export const brandImages = {
  /** Foto principal del hero. Si no existe, se usa la primera foto de sabor disponible. */
  hero: "hero-cookie",
  box: "box-cookies",
  logo: "logo-sweet-cookies",
} as const;
