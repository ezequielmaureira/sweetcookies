/**
 * Datos de marca y navegación.
 * Solo información confirmada: no agregar direcciones, horarios ni precios
 * hasta que existan datos reales.
 */
export const site = {
  name: "Sweet Cookies",
  tagline: "Cookies artesanales",
  instagram: {
    handle: "@sweet.cookies.rio4",
    url: "https://www.instagram.com/sweet.cookies.rio4/",
  },
} as const;

export type NavLink = { label: string; href: string };

/** Rutas de la app. */
export const routes = {
  home: "/",
  buildBox: "/arma-tu-caja",
} as const;

export const navLinks: NavLink[] = [
  { label: "Inicio", href: "/#inicio" },
  { label: "Sabores", href: "/#sabores" },
  { label: "Armá tu caja", href: routes.buildBox },
];

/** Anclas de las secciones de la home (reutilizadas por header, CTAs y secciones). */
export const sectionIds = {
  home: "inicio",
  flavors: "sabores",
  buildBox: "arma-tu-caja",
} as const;
