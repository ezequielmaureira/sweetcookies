import { Playfair_Display } from "next/font/google";

/**
 * Tipografía exclusiva de la pantalla de mantenimiento: serif elegante y
 * artesanal para la frase principal (reemplaza la itálica genérica del
 * display del resto del sitio). No afecta ninguna otra pantalla.
 */
export const maintenanceTitleFont = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["italic"],
  display: "swap",
});
