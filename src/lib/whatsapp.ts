/**
 * Construcción del pedido para WhatsApp.
 * Sin dependencias de React ni del catálogo: recibe datos simples.
 * El número del negocio NO está en el código: viene de la configuración en la
 * base (SiteSettings), devuelto por el servidor al confirmar el pedido.
 */
import { formatPrice } from "./catalog.ts";
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

/** Datos del pedido guardado (número y total calculado por el servidor). */
export type SavedOrderInfo = { number: number; total: string };

/**
 * Mensaje del pedido. El box (cookies) y los productos adicionales van en
 * secciones separadas: los adicionales no son parte del box.
 */
export function buildOrderMessage(lines: OrderLine[], customer: CustomerDetails, order?: SavedOrderInfo): string {
  const validLines = lines.filter((line) => line.quantity > 0);
  const boxLines = validLines.filter((line) => line.kind !== "OTHER");
  const extraLines = validLines.filter((line) => line.kind === "OTHER");
  const units = (list: OrderLine[]) => list.reduce((sum, line) => sum + line.quantity, 0);
  const cookieCount = units(boxLines);
  const extraCount = units(extraLines);
  const cookies = `${cookieCount} ${cookieCount === 1 ? "cookie" : "cookies"}`;
  const extras = `${extraCount} ${extraCount === 1 ? "producto" : "productos"}`;
  const count = extraCount === 0 ? cookies : cookieCount === 0 ? extras : `${cookies} + ${extras}`;
  const lineText = (line: OrderLine) => `${line.quantity} × ${line.name}${line.subtotal ? ` — ${formatPrice(line.subtotal)}` : ""}`;
  const sections: string[] = [];
  if (boxLines.length) sections.push(`BOX DE ${cookies.toUpperCase()}:`, ...boxLines.map(lineText), "");
  // Sin cookies no hay caja: es un pedido normal de productos.
  if (extraLines.length) sections.push(boxLines.length ? "PRODUCTOS ADICIONALES:" : "PRODUCTOS:", ...extraLines.map(lineText), "");

  const name = cleanText(`${customer.name} ${customer.lastName ?? ""}`);
  const phone = cleanText(customer.phone);
  const email = cleanText(customer.email ?? "");
  const address = cleanText(customer.address);
  const notes = cleanText(customer.notes, { multiline: true });

  const parts: string[] = [
    order ? `🍪 NUEVO PEDIDO #${order.number} — SWEET COOKIES` : "🍪 NUEVO PEDIDO — SWEET COOKIES",
    "",
    "Hola! Quiero hacer este pedido:",
    "",
    ...sections,
    order ? `TOTAL: ${formatPrice(order.total)} (${count})` : `Total: ${count}`,
    "",
    `Nombre: ${name}`,
  ];

  if (phone) parts.push(`Teléfono: ${phone}`);
  if (email) parts.push(`Email: ${email}`);
  if (customer.method === "retiro") parts.push("Modalidad: Retiro");
  if (customer.method === "envio") {
    parts.push("Modalidad: Envío");
    if (address) parts.push(`Dirección: ${address}`);
  }
  if (notes) parts.push("", "Observaciones:", notes);
  if (order) parts.push("", `Número de pedido: #${order.number}`);
  parts.push("", "Gracias!");

  return parts.join("\n");
}

export function buildWhatsAppUrl(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
