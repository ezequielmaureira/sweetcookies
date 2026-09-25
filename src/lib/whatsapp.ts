/**
 * Construcción del pedido para WhatsApp.
 * Sin dependencias de React ni del catálogo: recibe datos simples.
 */
import type { CustomerDetails, OrderLine } from "./order";

/**
 * Normaliza un número de WhatsApp al formato de wa.me (solo dígitos, con
 * código de país, ej. 549XXXXXXXXXX). Devuelve null si el valor está vacío o
 * no parece un número internacional válido (E.164: 8 a 15 dígitos).
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return digits;
}

/** Número configurado en NEXT_PUBLIC_WHATSAPP_NUMBER, normalizado, o null. */
export function getConfiguredWhatsAppNumber(): string | null {
  // Referencia literal para que Next.js la inyecte en el bundle del cliente.
  return normalizeWhatsAppNumber(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
}

/** Limpia texto libre: saca espacios sobrantes y colapsa líneas vacías repetidas. */
function cleanText(value: string, { multiline = false } = {}): string {
  const text = value.replace(/\r\n?/g, "\n");
  if (!multiline) return text.replace(/\s+/g, " ").trim();
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildOrderMessage(lines: OrderLine[], customer: CustomerDetails): string {
  const validLines = lines.filter((line) => line.quantity > 0);
  const total = validLines.reduce((sum, line) => sum + line.quantity, 0);

  const name = cleanText(customer.name);
  const phone = cleanText(customer.phone);
  const address = cleanText(customer.address);
  const notes = cleanText(customer.notes, { multiline: true });

  const parts: string[] = [
    "🍪 NUEVO PEDIDO — SWEET COOKIES",
    "",
    "Hola! Quiero hacer este pedido:",
    "",
    ...validLines.map((line) => `${line.quantity} × ${line.name}`),
    "",
    `Total: ${total} ${total === 1 ? "cookie" : "cookies"}`,
    "",
    `Nombre: ${name}`,
  ];

  if (phone) parts.push(`Teléfono: ${phone}`);
  if (customer.method === "retiro") parts.push("Modalidad: Retiro");
  if (customer.method === "envio") {
    parts.push("Modalidad: Envío");
    if (address) parts.push(`Dirección: ${address}`);
  }
  if (notes) parts.push("", "Observaciones:", notes);
  parts.push("", "Gracias!");

  return parts.join("\n");
}

export function buildWhatsAppUrl(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
