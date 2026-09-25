import { BuildBoxSection } from "@/components/build-box/BuildBoxSection";
import { FinalCTA } from "@/components/final-cta/FinalCTA";
import { FlavorsSection } from "@/components/flavors/FlavorsSection";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { Hero } from "@/components/hero/Hero";
import { RevealObserver } from "@/components/ui/RevealObserver";
import { brandImages } from "@/data/cookies";
import { getPublicCatalog } from "@/lib/catalog-server";
import { getHeroCookie } from "@/lib/hero-cookie";
import { resolveImage } from "@/lib/images";

export default async function HomePage() {
  // Mismo catálogo que el admin (PostgreSQL). La petición se comparte con el layout.
  const catalog = await getPublicCatalog();

  const heroCookie = getHeroCookie();

  return (
    <>
      <Header logoSrc={resolveImage(brandImages.logo)} />
      <main id="contenido">
        <Hero cookieSrc={heroCookie.src} isCutout={heroCookie.isCutout} imageAlt={heroCookie.alt} />
        <FlavorsSection products={catalog.products} unavailable={catalog.status === "error"} />
        <BuildBoxSection imageSrc={resolveImage(brandImages.box)} />
        <FinalCTA />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
