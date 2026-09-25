import { BuildBoxSection } from "@/components/build-box/BuildBoxSection";
import { FinalCTA } from "@/components/final-cta/FinalCTA";
import { FlavorsSection } from "@/components/flavors/FlavorsSection";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { Hero } from "@/components/hero/Hero";
import { RevealObserver } from "@/components/ui/RevealObserver";
import { brandImages, flavors } from "@/data/cookies";
import { resolveFirstImage, resolveImage } from "@/lib/images";

export default function HomePage() {
  const flavorItems = flavors.map((flavor) => ({ flavor, imageSrc: resolveImage(flavor.image) }));

  // Hero: foto dedicada si existe; si no, la primera foto de sabor disponible.
  const heroSrc = resolveFirstImage([brandImages.hero, ...flavors.map((f) => f.image)]);
  const heroFlavor = flavors.find((f) => heroSrc?.includes(`/${f.image}.`));

  return (
    <>
      <Header logoSrc={resolveImage(brandImages.logo)} />
      <main id="contenido">
        <Hero imageSrc={heroSrc} imageAlt={heroFlavor?.alt ?? "Cookie artesanal de Sweet Cookies"} />
        <FlavorsSection items={flavorItems} />
        <BuildBoxSection imageSrc={resolveImage(brandImages.box)} />
        <FinalCTA />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
