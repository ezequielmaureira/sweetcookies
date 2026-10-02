import { Libre_Caslon_Text } from "next/font/google";

/**
 * Serif clásica para los textos dinámicos del voucher (fecha y código), en
 * línea con la tipografía del arte original. Se usa en el canvas, así que
 * hace falta el nombre real de la familia (style.fontFamily).
 */
export const voucherFont = Libre_Caslon_Text({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
