import { BuildBoxSection } from "@/components/build-box/BuildBoxSection";
import { FinalCTA } from "@/components/final-cta/FinalCTA";
import { FlavorsSection } from "@/components/flavors/FlavorsSection";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { Hero } from "@/components/hero/Hero";
import { RevealObserver } from "@/components/ui/RevealObserver";
import { brandImages } from "@/data/cookies";
import { getHeroCookie } from "@/lib/hero-cookie";
import { resolveImage } from "@/lib/images";
import { getSiteTexts } from "@/lib/site-content-server";

export default async function HomePage() {
  const texts = await getSiteTexts();
  const heroCookie = getHeroCookie();

  return (
    <>
      <Header logoSrc={resolveImage(brandImages.logo)} />
      <main id="contenido">
        <Hero cookieSrc={heroCookie.src} isCutout={heroCookie.isCutout} imageAlt={heroCookie.alt} texts={texts} />
        <FlavorsSection title={texts.FLAVORS_TITLE} subtitle={texts.FLAVORS_DESCRIPTION} />
        <BuildBoxSection
          imageSrc={resolveImage(brandImages.box)}
          title={texts.BOX_TITLE}
          text={texts.BOX_DESCRIPTION}
          ctaLabel={texts.BOX_CTA}
        />
        <FinalCTA title={texts.FINAL_CTA_TITLE} buttonLabel={texts.FINAL_CTA_BUTTON} />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
