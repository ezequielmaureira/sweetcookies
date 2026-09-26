"use client";

import { useId, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/catalog";
import {
  EMPTY_CUSTOMER,
  FIELD_LIMITS,
  deliveryMethodLabels,
  validateOrder,
  type CustomerDetails,
  type CustomerField,
  type DeliveryMethod,
  type FieldErrors,
} from "@/lib/order";
import { createOrder, type OrderProblem, type OrderReceipt } from "@/lib/order-api";
import { usePublicSettings } from "@/lib/use-public-settings";
import { buildOrderMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import styles from "./CustomerForm.module.css";

const IS_DEV = process.env.NODE_ENV !== "production";

type CustomerFormProps = {
  /** "Nuevo pedido": limpia carrito y formulario. */
  onReset: () => void;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; order: OrderReceipt; url: string; popupBlocked: boolean }
  | { kind: "error"; message: string; problems?: OrderProblem[] };

function problemText(problem: OrderProblem): string {
  const name = problem.name ?? "Un producto";
  if (problem.reason === "insufficient_stock") {
    return problem.available === 1 ? `${name}: queda 1 unidad.` : `${name}: quedan ${problem.available} unidades.`;
  }
  return `${name} ya no está disponible.`;
}

/**
 * Paso 3: datos del cliente → el pedido se guarda en el servidor (precios,
 * stock y total reales) → se abre WhatsApp con el número del negocio que
 * devuelve el servidor (configuración en la base, nunca hardcodeado).
 */
export function CustomerForm({ onReset }: CustomerFormProps) {
  const { lines, totalCount, clearCart, setItemQuantity, removeItem, refreshCatalog } = useCart();
  // Estado de pedidos (pausados / sin número): viene de la API (base de datos), no del build.
  const publicSettings = usePublicSettings();
  const settingsLoading = publicSettings.status === "loading";
  const ordersPaused = publicSettings.settings?.whatsappOrdersEnabled === false;
  const hasWhatsApp = Boolean(publicSettings.settings?.whatsappNumber) && !ordersPaused;
  const instagramHandle = publicSettings.settings?.instagramHandle ?? null;
  const [customer, setCustomer] = useState<CustomerDetails>(EMPTY_CUSTOMER);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const done = state.kind === "done";
  const sending = state.kind === "sending";

  const update = <K extends keyof CustomerDetails>(field: K, value: CustomerDetails[K]) => {
    const next = { ...customer, [field]: value };
    setCustomer(next);
    // Después del primer intento, la validación acompaña lo que se escribe.
    if (submitted) setErrors(validateOrder({ customer: next, totalCount, hasWhatsAppNumber: true }).fieldErrors);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || done) return;
    setSubmitted(true);

    if (settingsLoading) return;
    const result = validateOrder({ customer, totalCount, hasWhatsAppNumber: hasWhatsApp });
    setErrors(result.fieldErrors);

    if (!result.isValid) {
      const firstInvalid = (["name", "email", "method", "address"] as CustomerField[]).find((f) => result.fieldErrors[f]);
      if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)?.focus();
      return;
    }

    // La pestaña se abre en el mismo click (si no, el navegador la bloquea) y
    // recién después de guardar el pedido se le carga el link de WhatsApp.
    const popup = window.open("", "_blank");
    setState({ kind: "sending" });
    const created = await createOrder(
      lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      customer,
    );

    if (!created.ok) {
      popup?.close();
      if (created.kind === "items") {
        // La caja se ajusta a lo que hay realmente (según el servidor) para poder reenviar.
        for (const problem of created.problems) {
          if (problem.reason === "insufficient_stock" && problem.available > 0) setItemQuantity(problem.productId, problem.available);
          else removeItem(problem.productId);
        }
        void refreshCatalog(); // Stock real, directo de la API (sin caché).
        setState({
          kind: "error",
          message: "Algunos productos cambiaron mientras armabas tu caja. Ya ajustamos tu pedido; revisalo y volvé a enviarlo:",
          problems: created.problems,
        });
      } else if (created.kind === "validation") {
        setErrors((prev) => ({ ...prev, ...(created.fields as FieldErrors) }));
        setState({ kind: "error", message: "Revisá los datos marcados." });
      } else if (created.kind === "paused") {
        setState({ kind: "error", message: "Los pedidos están pausados en este momento." });
      } else if (created.kind === "rate-limit") {
        setState({ kind: "error", message: "Recibimos varios pedidos seguidos desde tu conexión. Esperá unos minutos y probá de nuevo." });
      } else {
        setState({ kind: "error", message: "No pudimos registrar tu pedido. Revisá tu conexión y probá de nuevo." });
      }
      return;
    }

    const message = buildOrderMessage(
      created.order.items.map((item) => ({ name: item.name, quantity: item.quantity, subtotal: item.subtotal })),
      customer,
      { number: created.order.number, total: created.order.total },
    );
    const url = buildWhatsAppUrl(created.whatsappNumber, message);
    let popupBlocked = !popup;
    if (popup) {
      try {
        popup.opener = null;
        popup.location.href = url;
      } catch {
        popupBlocked = true;
      }
    }
    setState({ kind: "done", order: created.order, url, popupBlocked });
    void refreshCatalog();
  };

  const handleReset = () => {
    setCustomer(EMPTY_CUSTOMER);
    setErrors({});
    setSubmitted(false);
    setState({ kind: "idle" });
    clearCart();
    onReset();
  };

  const cartEmpty = totalCount === 0;
  const locked = sending || done;
  const describedBy = (field: CustomerField, hint?: string) =>
    [errors[field] ? id(`${field}-error`) : "", hint ?? ""].filter(Boolean).join(" ") || undefined;

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={sending}>
      <fieldset className={styles.group} disabled={locked}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={id("name")} className={styles.label}>
              Nombre <span className={styles.required} aria-hidden="true">*</span>
            </label>
            <input
              id={id("name")}
              data-field="name"
              className={styles.input}
              type="text"
              autoComplete="given-name"
              required
              maxLength={FIELD_LIMITS.name}
              value={customer.name}
              onChange={(e) => update("name", e.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describedBy("name")}
            />
            <FieldError id={id("name-error")} message={errors.name} />
          </div>

          <div className={styles.field}>
            <label htmlFor={id("lastName")} className={styles.label}>
              Apellido <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              id={id("lastName")}
              className={styles.input}
              type="text"
              autoComplete="family-name"
              maxLength={FIELD_LIMITS.lastName}
              value={customer.lastName}
              onChange={(e) => update("lastName", e.target.value)}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={id("phone")} className={styles.label}>
              Teléfono <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              id={id("phone")}
              className={styles.input}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={FIELD_LIMITS.phone}
              value={customer.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={id("email")} className={styles.label}>
              Email <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              id={id("email")}
              data-field="email"
              className={styles.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={FIELD_LIMITS.email}
              value={customer.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy("email")}
            />
            <FieldError id={id("email-error")} message={errors.email} />
          </div>
        </div>

        <fieldset
          className={styles.fieldset}
          aria-invalid={Boolean(errors.method)}
          aria-describedby={describedBy("method")}
        >
          <legend className={styles.label}>
            Modalidad <span className={styles.required} aria-hidden="true">*</span>
            <span className="visually-hidden"> (obligatorio)</span>
          </legend>
          <div className={styles.segmented}>
            {(Object.keys(deliveryMethodLabels) as DeliveryMethod[]).map((method, i) => (
              <label key={method} className={styles.option}>
                <input
                  type="radio"
                  name={id("method")}
                  value={method}
                  data-field={i === 0 ? "method" : undefined}
                  checked={customer.method === method}
                  onChange={() => update("method", method)}
                  required
                />
                <span>{deliveryMethodLabels[method]}</span>
              </label>
            ))}
          </div>
          <FieldError id={id("method-error")} message={errors.method} />
        </fieldset>

        {customer.method === "envio" && (
          <div className={`${styles.field} ${styles.reveal}`}>
            <label htmlFor={id("address")} className={styles.label}>
              Dirección de entrega <span className={styles.required} aria-hidden="true">*</span>
            </label>
            <input
              id={id("address")}
              data-field="address"
              className={styles.input}
              type="text"
              autoComplete="street-address"
              required
              maxLength={FIELD_LIMITS.address}
              value={customer.address}
              onChange={(e) => update("address", e.target.value)}
              aria-invalid={Boolean(errors.address)}
              aria-describedby={describedBy("address")}
            />
            <FieldError id={id("address-error")} message={errors.address} />
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor={id("notes")} className={styles.label}>
            Observaciones <span className={styles.optional}>(opcional)</span>
          </label>
          <textarea
            id={id("notes")}
            className={`${styles.input} ${styles.textarea}`}
            rows={3}
            maxLength={FIELD_LIMITS.notes}
            value={customer.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </div>
      </fieldset>

      <div className={styles.submit}>
        {submitted && cartEmpty && !done && (
          <p className={styles.formError} role="alert">
            Tu caja está vacía. Agregá al menos una cookie.
          </p>
        )}
        {ordersPaused && !done && (
          <p className={styles.formError} role="status">
            Los pedidos por WhatsApp están pausados temporalmente.
            {instagramHandle && ` Podés escribirnos por Instagram: ${instagramHandle}.`}
          </p>
        )}
        {!settingsLoading && !ordersPaused && !hasWhatsApp && !done && (
          <p className={styles.formError} role="status">
            {IS_DEV
              ? "Falta configurar el teléfono de pedidos (en /admin/configuracion)."
              : `Por ahora no podemos recibir pedidos por WhatsApp.${instagramHandle ? ` Escribinos por Instagram: ${instagramHandle}.` : ""}`}
          </p>
        )}
        {state.kind === "error" && (
          <div className={styles.formError} role="alert">
            <p>{state.message}</p>
            {state.problems && state.problems.length > 0 && (
              <ul className={styles.problems}>
                {state.problems.map((p) => (
                  <li key={p.productId}>{problemText(p)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!done && (
          <Button
            type="submit"
            className={styles.whatsapp}
            disabled={settingsLoading || !hasWhatsApp || sending}
            aria-busy={settingsLoading || sending}
          >
            <WhatsAppIcon />
            {sending ? "Registrando tu pedido…" : "Enviar pedido por WhatsApp"}
          </Button>
        )}

        {state.kind === "done" && (
          <div className={styles.opened} role="status">
            <p>
              <strong>Pedido #{state.order.number} registrado</strong> · Total {formatPrice(state.order.total)}
            </p>
            <p>
              {state.popupBlocked
                ? "Tocá el botón para abrir WhatsApp con tu pedido y enviarlo."
                : <>Abrimos WhatsApp con tu pedido. Revisalo y tocá <strong>enviar</strong> allá.</>}
            </p>
            <p className={styles.openedActions}>
              <a href={state.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {state.popupBlocked ? "Abrir WhatsApp" : "¿No se abrió? Abrir WhatsApp de nuevo"}
              </a>
              <button type="button" className={styles.link} onClick={handleReset}>
                Nuevo pedido
              </button>
            </p>
          </div>
        )}
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className={styles.error}>
      {message}
    </p>
  );
}

/** Ícono de WhatsApp inline (evita instalar una librería de íconos). */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        fill="currentColor"
        d="M12 2.2a9.7 9.7 0 0 0-8.3 14.8L2.3 21.8l4.9-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.8 2c0 1.2.9 2.3 1 2.5.1.2 1.7 2.6 4.1 3.6 1.5.7 2.1.7 2.9.6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.4Z"
      />
    </svg>
  );
}
