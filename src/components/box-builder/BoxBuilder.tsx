"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { formatCookieCount } from "@/lib/cart";
import { prefetchPublicSettings } from "@/lib/use-public-settings";
import { BoxPreview } from "./BoxPreview";
import { CustomerForm } from "./CustomerForm";
import { FlavorSelector } from "./FlavorSelector";
import { MobileBoxBar } from "./MobileBoxBar";
import { OrderSummary } from "./OrderSummary";
import styles from "./BoxBuilder.module.css";

const SECTION = {
  flavors: "paso-sabores",
  box: "paso-caja",
  confirm: "paso-confirmar",
} as const;

/** Armá tu caja: 1) sabores, 2) caja + resumen, 3) datos y WhatsApp. Todo en una pantalla. */
export function BoxBuilder() {
  const { items, lines, totalCount, totalCents, productsById, incrementItem, decrementItem, removeItem, clearCart } = useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const flavorsHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusConfirm = useRef(false);

  // Pide la configuración de pedidos apenas se abre la página (el backend puede estar dormido).
  useEffect(() => {
    void prefetchPublicSettings();
  }, []);

  // Al abrir el paso 3, llevar la vista y el foco a su título.
  useEffect(() => {
    if (!checkoutOpen || !shouldFocusConfirm.current) return;
    shouldFocusConfirm.current = false;
    const heading = confirmHeadingRef.current;
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [checkoutOpen]);

  const announce = (id: string, quantity: number) => {
    const name = productsById[id]?.name ?? "";
    const text = quantity === 0 ? `${name} quitada de tu caja.` : `${name}: ${quantity} en tu caja.`;
    // Alterna un carácter invisible para que se repita el anuncio aunque el texto sea igual.
    setAnnouncement((prev) => (prev.endsWith("​") ? text : `${text}​`));
  };

  const handleIncrement = (id: string) => {
    incrementItem(id);
    announce(id, Math.min((items[id] ?? 0) + 1, productsById[id]?.stock ?? 0));
  };
  const handleDecrement = (id: string) => {
    decrementItem(id);
    announce(id, Math.max(0, (items[id] ?? 0) - 1));
  };
  const handleRemove = (id: string) => {
    removeItem(id);
    announce(id, 0);
  };

  const goToFlavors = () => {
    const heading = flavorsHeadingRef.current;
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  };

  const openCheckout = () => {
    if (checkoutOpen) {
      confirmHeadingRef.current?.scrollIntoView({ block: "start" });
      confirmHeadingRef.current?.focus({ preventScroll: true });
      return;
    }
    shouldFocusConfirm.current = true;
    setCheckoutOpen(true);
  };

  const startNewOrder = () => {
    clearCart();
    setFormKey((k) => k + 1);
    setCheckoutOpen(false);
    setAnnouncement("Pedido vacío. Podés armar una caja nueva.");
    goToFlavors();
  };

  const activeStep = checkoutOpen ? 3 : totalCount > 0 ? 2 : 1;

  return (
    <div className={styles.builder}>
      <header className={`container ${styles.intro}`}>
        <p className="kicker">Armá tu caja</p>
        <h1 className={styles.title}>
          Creá tu combinación perfecta.
        </h1>
        <p className={styles.lead}>Elegí tus cookies favoritas y armá tu pedido.</p>

        <ol className={styles.steps} aria-label="Pasos del pedido">
          {[
            { n: 1, label: "Elegí tus sabores", href: SECTION.flavors },
            { n: 2, label: "Armá tu caja", href: SECTION.box },
            { n: 3, label: "Confirmá tu pedido", href: SECTION.confirm },
          ].map((step) => (
            <li
              key={step.n}
              className={[
                styles.step,
                step.n === activeStep ? styles.stepActive : "",
                step.n < activeStep ? styles.stepDone : "",
              ].join(" ")}
              aria-current={step.n === activeStep ? "step" : undefined}
            >
              <span className={styles.stepNumber}>Paso {step.n}</span>
              <span className={styles.stepLabel}>{step.label}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className={`container ${styles.layout}`}>
        <section id={SECTION.flavors} className={styles.flavors} aria-labelledby={`${SECTION.flavors}-title`}>
          <StepHeading id={`${SECTION.flavors}-title`} n={1} ref={flavorsHeadingRef}>
            Elegí tus sabores
          </StepHeading>
          <FlavorSelector
            quantities={items}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
          />
        </section>

        <aside id={SECTION.box} className={styles.boxColumn} aria-labelledby={`${SECTION.box}-title`}>
          <div className={styles.sticky}>
            <StepHeading id={`${SECTION.box}-title`} n={2}>
              Armá tu caja
            </StepHeading>
            <BoxPreview lines={lines} totalCount={totalCount} />
            <OrderSummary
              lines={lines}
              totalCount={totalCount}
              totalCents={totalCents}
              onRemove={handleRemove}
              onKeepChoosing={goToFlavors}
              onContinue={openCheckout}
            />
          </div>
        </aside>
      </div>

      <section id={SECTION.confirm} className={styles.confirm} aria-labelledby={`${SECTION.confirm}-title`}>
        <div className={`container ${styles.confirmInner}`}>
          <div className={styles.confirmIntro}>
            <StepHeading id={`${SECTION.confirm}-title`} n={3} ref={confirmHeadingRef}>
              Confirmá tu pedido
            </StepHeading>
            {checkoutOpen ? (
              <>
                <OrderSummary lines={lines} totalCount={totalCount} totalCents={totalCents} compact />
              </>
            ) : (
              <p className={styles.confirmHint}>
                {totalCount > 0
                  ? `Tu caja tiene ${formatCookieCount(totalCount)}. Cuando esté lista, continuá tu pedido.`
                  : "Cuando tengas tu caja lista, completá tus datos y envianos el pedido por WhatsApp."}
              </p>
            )}
          </div>

          {checkoutOpen ? (
            <div className={styles.formColumn}>
              <CustomerForm key={formKey} onReset={startNewOrder} />
            </div>
          ) : (
            totalCount > 0 && (
              <div className={styles.formColumn}>
                <button type="button" className={styles.continueLink} onClick={openCheckout}>
                  Continuar pedido →
                </button>
              </div>
            )
          )}
        </div>
      </section>

      <MobileBoxBar totalCount={totalCount} boxTargetId={SECTION.box} hideWhenVisibleIds={[SECTION.box, SECTION.confirm]} />

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

type StepHeadingProps = {
  id: string;
  n: number;
  children: React.ReactNode;
  ref?: React.Ref<HTMLHeadingElement>;
};

function StepHeading({ id, n, children, ref }: StepHeadingProps) {
  return (
    <div className={styles.stepHeading}>
      <span className={styles.stepHeadingNumber} aria-hidden="true">
        0{n}
      </span>
      <h2 id={id} ref={ref} tabIndex={-1} className={styles.stepHeadingTitle}>
        <span className="visually-hidden">Paso {n}: </span>
        {children}
      </h2>
    </div>
  );
}
