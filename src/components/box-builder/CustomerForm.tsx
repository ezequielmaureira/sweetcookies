"use client";

import { useId, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
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
import { usePublicSettings } from "@/lib/use-public-settings";
import { buildOrderMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import styles from "./CustomerForm.module.css";

const IS_DEV = process.env.NODE_ENV !== "production";

type CustomerFormProps = {
  /** Se llama después de abrir WhatsApp (el carrito NO se limpia solo). */
  onOpened?: () => void;
  /** "Nuevo pedido": limpia carrito y formulario. */
  onReset: () => void;
};

/** Paso 3: datos mínimos del cliente + envío del pedido por WhatsApp. */
export function CustomerForm({ onOpened, onReset }: CustomerFormProps) {
  const { lines, totalCount } = useCart();
  // Número y estado de pedidos: vienen de la API (Neon), no del build.
  const publicSettings = usePublicSettings();
  const settingsLoading = publicSettings.status === "loading";
  const ordersPaused = publicSettings.settings?.whatsappOrdersEnabled === false;
  const whatsappNumber = publicSettings.settings && !ordersPaused ? publicSettings.settings.whatsappNumber : null;
  const instagramHandle = publicSettings.settings?.instagramHandle ?? null;
  const [customer, setCustomer] = useState<CustomerDetails>(EMPTY_CUSTOMER);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;

  const orderLines = lines.map(({ flavor, quantity }) => ({ name: flavor.name, quantity }));

  const update = <K extends keyof CustomerDetails>(field: K, value: CustomerDetails[K]) => {
    const next = { ...customer, [field]: value };
    setCustomer(next);
    // Después del primer intento, la validación acompaña lo que se escribe.
    if (submitted) setErrors(validateOrder({ customer: next, totalCount, hasWhatsAppNumber: true }).fieldErrors);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);

    if (settingsLoading) return;
    const result = validateOrder({ customer, totalCount, hasWhatsAppNumber: Boolean(whatsappNumber) });
    setErrors(result.fieldErrors);

    if (!result.isValid || !whatsappNumber) {
      const firstInvalid = (["name", "method", "address"] as CustomerField[]).find((f) => result.fieldErrors[f]);
      if (firstInvalid) {
        formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)?.focus();
      }
      return;
    }

    const url = buildWhatsAppUrl(whatsappNumber, buildOrderMessage(orderLines, customer));
    // wa.me abre la app en mobile (si está instalada) o WhatsApp Web en desktop.
    window.open(url, "_blank", "noopener,noreferrer");
    setOpenedUrl(url);
    onOpened?.();
  };

  const handleReset = () => {
    setCustomer(EMPTY_CUSTOMER);
    setErrors({});
    setSubmitted(false);
    setOpenedUrl(null);
    onReset();
  };

  const cartEmpty = totalCount === 0;
  const describedBy = (field: CustomerField, hint?: string) =>
    [errors[field] ? id(`${field}-error`) : "", hint ?? ""].filter(Boolean).join(" ") || undefined;

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor={id("name")} className={styles.label}>
          Nombre <span className={styles.required} aria-hidden="true">*</span>
        </label>
        <input
          id={id("name")}
          data-field="name"
          className={styles.input}
          type="text"
          autoComplete="name"
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

      <div className={styles.submit}>
        {submitted && cartEmpty && (
          <p className={styles.formError} role="alert">
            Tu caja está vacía. Agregá al menos una cookie.
          </p>
        )}
        {ordersPaused && (
          <p className={styles.formError} role="status">
            Los pedidos por WhatsApp están pausados temporalmente.
            {instagramHandle && ` Podés escribirnos por Instagram: ${instagramHandle}.`}
          </p>
        )}
        {!settingsLoading && !ordersPaused && !whatsappNumber && (
          <p className={styles.formError} role="status">
            {IS_DEV
              ? "Falta configurar el número de WhatsApp (en /admin/configuracion)."
              : `Por ahora no podemos recibir pedidos por WhatsApp.${instagramHandle ? ` Escribinos por Instagram: ${instagramHandle}.` : ""}`}
          </p>
        )}

        <Button
          type="submit"
          className={styles.whatsapp}
          disabled={settingsLoading || !whatsappNumber}
          aria-busy={settingsLoading}
        >
          <WhatsAppIcon />
          Enviar pedido por WhatsApp
        </Button>

        {openedUrl && (
          <div className={styles.opened} role="status">
            <p>
              Abrimos WhatsApp con tu pedido. Revisalo y tocá <strong>enviar</strong> allá.
            </p>
            <p className={styles.openedActions}>
              <a href={openedUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
                ¿No se abrió? Abrir WhatsApp de nuevo
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
