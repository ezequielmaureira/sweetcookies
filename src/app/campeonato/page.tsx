import type { Metadata, Viewport } from "next";
import { getImageProps } from "next/image";
import { ChallengeApp } from "@/components/challenge/ChallengeApp";
import type { ChallengeCookie } from "@/components/challenge/useCookieImage";
import { brandImages } from "@/data/cookies";
import { getHeroCookie } from "@/lib/hero-cookie";
import { resolveImage } from "@/lib/images";

export const metadata: Metadata = {
  title: "Sweet Click Challenge — Sweet Cookies",
  description: "¿Cuántas cookies podés devorar en 15 segundos?",
  // Demo en revisión: todavía no se anuncia ni se indexa.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c110b",
};

/** La misma medida para la portada y para el juego: una sola descarga de la foto. */
const COOKIE_SIZES = "(min-width: 768px) 520px, 88vw";

/**
 * /campeonato vive fuera del grupo (site) a propósito: no pasa por la cookie de
 * entrada (SiteEntryGate) ni por el carrito, y no cambia nada de la tienda.
 */
export default function ChallengePage() {
  const hero = getHeroCookie();
  let cookie: ChallengeCookie | null = null;
  if (hero.src) {
    const { props } = getImageProps({ src: hero.src, alt: "", fill: true, sizes: COOKIE_SIZES });
    cookie = { path: hero.src, src: props.src, srcSet: props.srcSet, sizes: COOKIE_SIZES, isCutout: hero.isCutout, alt: hero.alt };
  }
  return <ChallengeApp cookie={cookie} logoSrc={resolveImage(brandImages.logo)} />;
}
