import type { Metadata } from "next";
import { FillingRevealDemo } from "@/components/cookie-reveal/FillingRevealDemo";
import { Footer } from "@/components/footer/Footer";
import { Header } from "@/components/header/Header";
import { brandImages } from "@/data/cookies";
import { site } from "@/data/site";
import { resolveImage } from "@/lib/images";

export const metadata: Metadata = {
  title: `Descubrí el relleno (demo) — ${site.name}`,
  robots: { index: false, follow: false },
};

/**
 * Demo aislada de "Descubrí el relleno" (etapa 1: solo la interacción), con el
 * par real de Nutella. Las dos fotos tienen el mismo encuadre (1000×1190).
 */
const DEMO = {
  cover: resolveImage("relleno-nutella-cerrada") ?? "/images/cookies/relleno-nutella-cerrada.jpg",
  reveal: resolveImage("relleno-nutella-abierta") ?? "/images/cookies/relleno-nutella-abierta.jpg",
  aspectRatio: "1000 / 1190",
  /** Borde de la cookie cerrada (0–1 de la foto): solo se raspa la cookie, no el plato ni el fondo. */
  scratchArea: [
    [0, 0.252], [0.075, 0.236], [0.188, 0.226], [0.375, 0.223], [0.525, 0.233], [0.65, 0.263], [0.775, 0.315],
    [0.863, 0.368], [0.912, 0.42], [0.95, 0.494], [0.96, 0.588], [0.95, 0.672], [0.912, 0.756], [0.85, 0.83],
    [0.75, 0.877], [0.6, 0.914], [0.425, 0.945], [0.25, 0.961], [0.125, 0.961], [0, 0.951],
  ] as const,
};

export default function FillingRevealDemoPage() {
  return (
    <>
      <Header logoSrc={resolveImage(brandImages.logo)} />
      <main id="contenido" className="container" style={{ paddingBlock: "calc(var(--header-h) + 48px) 96px", textAlign: "center" }}>
        <p className="kicker">Demo</p>
        <h1 style={{ margin: "8px 0 16px" }}>Descubrí el relleno</h1>
        <p style={{ maxWidth: 520, margin: "0 auto 28px", color: "var(--color-muted)" }}>
          Pasá el dedo sobre la cookie para ver lo que tiene adentro.
        </p>
        <FillingRevealDemo
          flavorName="Nutella & avellanas"
          coverImage={DEMO.cover}
          revealImage={DEMO.reveal}
          coverAlt="Cookie con cobertura de chocolate y avellanas"
          revealAlt="Cookie abierta con relleno de Nutella y trozos de avellana"
          aspectRatio={DEMO.aspectRatio}
          scratchArea={DEMO.scratchArea}
        />
      </main>
      <Footer />
    </>
  );
}
