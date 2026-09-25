/**
 * Importes escritos por el admin → string decimal para la API ("5000.50").
 * Acepta formato argentino ("5.000,50", "5000,5") y con punto decimal ("5000.50").
 * null si no es un importe válido (la validación definitiva es del servidor).
 */
export function normalizeMoneyInput(raw: string): string | null {
  let text = raw.replace(/[\s$]/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return `${Number(whole)}.${fraction.padEnd(2, "0")}`;
}

/** "5000.50" → "5000,50" / "5000.00" → "5000" para editar cómodo. */
export function moneyToInput(value: string): string {
  const [whole, fraction = "00"] = value.split(".");
  return fraction === "00" ? whole : `${whole},${fraction}`;
}
