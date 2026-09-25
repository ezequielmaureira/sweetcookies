import { BuildBoxSection } from "@/components/build-box/BuildBoxSection";
import { FinalCTA } from "@/components/final-cta/FinalCTA";
import { FlavorsSection } from "@/components/flavors/FlavorsSection";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { Hero } from "@/components/hero/Hero";
import { RevealObserver } from "@/components/ui/RevealObserver";
import { brandImages, flavors } from "@/data/cookies";
import { getHeroCookie } from "@/lib/hero-cookie";
import { resolveImage } from "@/lib/images";

export default function HomePage() {
  const flavorItems = flavors.map((flavor) => ({ flavor, imageSrc: resolveImage(flavor.image) }));

  const heroCookie = getHeroCookie();

  return (
    <>
      <Header logoSrc={resolveImage(brandImages.logo)} />
      <main id="contenido">
        <Hero cookieSrc={heroCookie.src} isCutout={heroCookie.isCutout} imageAlt={heroCookie.alt} />
        <FlavorsSection items={flavorItems} />
        <BuildBoxSection imageSrc={resolveImage(brandImages.box)} />
        <FinalCTA />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
