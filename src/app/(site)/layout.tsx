import { CartProvider } from "@/components/cart/CartProvider";
import { SiteEntryGate } from "@/components/entry/SiteEntryGate";
import { brandImages } from "@/data/cookies";
import { getPublicCatalog } from "@/lib/catalog-server";
import { getHeroCookie } from "@/lib/hero-cookie";
import { resolveImage } from "@/lib/images";

/**
 * Web pública (Home, Armá tu caja): la cubre la entrada "Probala para entrar."
 * una vez por sesión. El panel (/admin) y el login quedan fuera de este grupo.
 *
 * El catálogo sale de PostgreSQL (mismo origen que el admin) y se comparte con
 * el carrito de todas las páginas públicas.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getPublicCatalog();
  return (
    <CartProvider products={catalog.products}>
      <SiteEntryGate logoSrc={resolveImage(brandImages.logo)} cookie={getHeroCookie()}>
        {children}
      </SiteEntryGate>
    </CartProvider>
  );
}
