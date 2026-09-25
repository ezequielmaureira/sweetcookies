/**
 * Dinero en centavos enteros (lógica pura).
 *
 * En la base se guarda como DECIMAL(12,2); acá se trabaja en centavos para que
 * los cálculos (subtotales, ganancias, totales) sean exactos: nunca Float.
 * Hacia afuera (JSON) siempre viaja como string con 2 decimales ("5000.00").
 */

/** Máximo DECIMAL(12,2): 9.999.999.999,99. */
export const MAX_CENTS = 999_999_999_999;

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/** "5000", "5000.5", "5000.50" o 5000 → 500050 centavos. null si no es válido. */
export function parseMoney(input: unknown): number | null {
  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    text = input.toFixed(2);
  } else if (typeof input === "string") {
    text = input.trim();
  } else {
    return null;
  }
  if (!MONEY_PATTERN.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

/** Centavos → "5000.50" (formato para DECIMAL y para JSON). */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Valor Decimal de Prisma (o string/number) → centavos, sin pasar por Float. */
export function decimalToCents(value: { toFixed(digits: number): string } | string | number): number {
  const text = typeof value === "object" ? value.toFixed(2) : typeof value === "number" ? value.toFixed(2) : value;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}
