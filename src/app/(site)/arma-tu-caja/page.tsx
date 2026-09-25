import type { Metadata } from "next";
import { BoxBuilder } from "@/components/box-builder/BoxBuilder";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { brandImages } from "@/data/cookies";
import { site } from "@/data/site";
import { resolveImage } from "@/lib/images";

export const metadata: Metadata = {
  title: `Armá tu caja — ${site.name}`,
  description: "Elegí tus cookies favoritas, armá tu caja y envianos el pedido por WhatsApp.",
};

/** El catálogo real (PostgreSQL) llega por el CartProvider del layout público. */
export default function BuildBoxPage() {
  return (
    <>
      <Header logoSrc={resolveImage(brandImages.logo)} />
      <main id="contenido">
        <BoxBuilder />
      </main>
      <Footer />
    </>
  );
}
