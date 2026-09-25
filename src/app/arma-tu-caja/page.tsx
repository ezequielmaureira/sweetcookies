import type { Metadata } from "next";
import { BoxBuilder } from "@/components/box-builder/BoxBuilder";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { brandImages, flavors } from "@/data/cookies";
import { site } from "@/data/site";
import { resolveImage } from "@/lib/images";

export const metadata: Metadata = {
  title: `Armá tu caja — ${site.name}`,
  description: "Elegí tus cookies favoritas, armá tu caja y envianos el pedido por WhatsApp.",
};

export default function BuildBoxPage() {
  const images = Object.fromEntries(flavors.map((flavor) => [flavor.id, resolveImage(flavor.image)]));

  return (
    <>
      <Header logoSrc={resolveImage(brandImages.logo)} />
      <main id="contenido">
        <BoxBuilder images={images} />
      </main>
      <Footer />
    </>
  );
}
