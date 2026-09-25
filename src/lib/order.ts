/**
 * Modelo y validación del pedido (sin React), reutilizable y testeable.
 */

export type DeliveryMethod = "retiro" | "envio";

export const deliveryMethodLabels: Record<DeliveryMethod, string> = {
  retiro: "Retiro",
  envio: "Envío",
};

export type CustomerDetails = {
  name: string;
  phone: string;
  method: DeliveryMethod | "";
  address: string;
  notes: string;
};

export const EMPTY_CUSTOMER: CustomerDetails = {
  name: "",
  phone: "",
  method: "",
  address: "",
  notes: "",
};

/** Largos máximos de cada campo (evitan mensajes gigantes). */
export const FIELD_LIMITS = {
  name: 80,
  phone: 30,
  address: 200,
  notes: 600,
} as const;

export type OrderLine = { name: string; quantity: number };

export type CustomerField = "name" | "method" | "address";
export type FieldErrors = Partial<Record<CustomerField, string>>;
export type OrderIssue = "empty-cart" | "missing-whatsapp-number";

export type OrderValidation = {
  fieldErrors: FieldErrors;
  issues: OrderIssue[];
  isValid: boolean;
};

export function validateCustomer(customer: CustomerDetails): FieldErrors {
  const errors: FieldErrors = {};
  if (!customer.name.trim()) errors.name = "Contanos tu nombre.";
  if (customer.method !== "retiro" && customer.method !== "envio") {
    errors.method = "Elegí retiro o envío.";
  }
  if (customer.method === "envio" && !customer.address.trim()) {
    errors.address = "Indicá la dirección de entrega.";
  }
  return errors;
}

export function validateOrder(input: {
  customer: CustomerDetails;
  totalCount: number;
  hasWhatsAppNumber: boolean;
}): OrderValidation {
  const fieldErrors = validateCustomer(input.customer);
  const issues: OrderIssue[] = [];
  if (input.totalCount <= 0) issues.push("empty-cart");
  if (!input.hasWhatsAppNumber) issues.push("missing-whatsapp-number");
  return { fieldErrors, issues, isValid: Object.keys(fieldErrors).length === 0 && issues.length === 0 };
}
