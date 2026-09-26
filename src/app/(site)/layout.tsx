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
 * el carrito de todas las páginas públicas. El render del servidor es solo el
 * primer contenido: el navegador lo refresca contra la API (ver useLiveCatalog).
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getPublicCatalog();
  return (
    <CartProvider initialProducts={catalog.products} catalogOk={catalog.status === "ok"}>
      <SiteEntryGate logoSrc={resolveImage(brandImages.logo)} cookie={getHeroCookie()}>
        {children}
      </SiteEntryGate>
    </CartProvider>
  );
}
