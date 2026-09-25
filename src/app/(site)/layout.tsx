import { SiteEntryGate } from "@/components/entry/SiteEntryGate";
import { brandImages } from "@/data/cookies";
import { getHeroCookie } from "@/lib/hero-cookie";
import { resolveImage } from "@/lib/images";

/**
 * Web pública (Home, Armá tu caja): la cubre la entrada "Probala para entrar."
 * una vez por sesión. El panel (/admin) y el login quedan fuera de este grupo.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteEntryGate logoSrc={resolveImage(brandImages.logo)} cookie={getHeroCookie()}>
      {children}
    </SiteEntryGate>
  );
}
