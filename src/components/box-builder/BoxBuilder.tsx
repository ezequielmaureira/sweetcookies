"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { formatCartCount } from "@/lib/cart";
import { usePublicSettings } from "@/lib/use-public-settings";
import { CustomerForm } from "./CustomerForm";
import { FlavorSelector } from "./FlavorSelector";
import { MobileBoxBar } from "./MobileBoxBar";
import { OrderPreview } from "./OrderPreview";
import { OrderSummary } from "./OrderSummary";
import { OrdersPausedNotice } from "./OrdersPausedNotice";
import { useSiteTexts } from "@/components/site-content/SiteTextsProvider";
import styles from "./BoxBuilder.module.css";

const SECTION = {
  /** Los ids anteriores se conservan para no romper enlaces. */
  products: "paso-sabores",
  summary: "resumen-pedido",
  confirm: "paso-confirmar",
} as const;

/**
 * Página de compra (ruta /arma-tu-caja): una sola selección con TODOS los
 * productos (cookies y otros, en el orden del catálogo), una vista previa
 * dinámica del pedido, el resumen y después los datos + WhatsApp.
 *
 * La caja no es un paso aparte: aparece sola cuando hay al menos una cookie;
 * los otros productos se muestran al lado, nunca adentro.
 */
export function BoxBuilder() {
  const { items, boxLines, extraLines, totalCount, cookieCount, extraCount, totalCents, productsById, incrementItem, decrementItem, removeItem, clearCart } = useCart();
  const texts = useSiteTexts();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const productsHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusConfirm = useRef(false);

  // Configuración de pedidos (interruptor maestro): se pide apenas se abre la página.
  const publicSettings = usePublicSettings();
  const ordersPaused = publicSettings.settings?.ordersEnabled === false;

  // Al abrir los datos del pedido, llevar la vista y el foco a su título.
  useEffect(() => {
    if (!checkoutOpen || !shouldFocusConfirm.current) return;
    shouldFocusConfirm.current = false;
    const heading = confirmHeadingRef.current;
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [checkoutOpen]);

  const announce = (id: string, quantity: number) => {
    const name = productsById[id]?.name ?? "";
    const text = quantity === 0 ? `${name}: quitado de tu pedido.` : `${name}: ${quantity} en tu pedido.`;
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

  const goToProducts = () => {
    const heading = productsHeadingRef.current;
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
    setAnnouncement("Pedido vacío. Podés empezar uno nuevo.");
    goToProducts();
  };

  const preview = (compact: boolean) => (
    <OrderPreview boxLines={boxLines} extraLines={extraLines} cookieCount={cookieCount} extraCount={extraCount} totalCents={totalCents} compact={compact} />
  );

  const summary = (
    <OrderSummary
      boxLines={boxLines}
      extraLines={extraLines}
      totalCents={totalCents}
      onRemove={handleRemove}
      onIncrement={handleIncrement}
      onDecrement={handleDecrement}
      onKeepChoosing={goToProducts}
      onContinue={openCheckout}
    />
  );

  return (
    <div className={styles.builder}>
      <header className={`container ${styles.intro}`}>
        <p className="kicker">{texts.BUILDER_EYEBROW}</p>
        <h1 className={styles.title}>{texts.BUILDER_TITLE}</h1>
        <p className={styles.lead}>{texts.BUILDER_DESCRIPTION}</p>
        {/* Pedidos pausados por el negocio: se puede mirar y elegir, pero no confirmar. */}
        {ordersPaused && (
          <OrdersPausedNotice
            className={styles.pausedNotice}
            message={publicSettings.settings?.ordersDisabledMessage ?? null}
            instagramHandle={publicSettings.settings?.instagramHandle}
          />
        )}
      </header>

      <div className={`container ${styles.layout}`}>
        <section id={SECTION.products} className={styles.products} aria-labelledby={`${SECTION.products}-title`}>
          <SectionHeading id={`${SECTION.products}-title`} ref={productsHeadingRef}>
            Elegí tus productos
          </SectionHeading>

          {/* Celular/tablet: vista previa chica arriba (no queda fija: no tapa los productos). */}
          <div className={styles.previewMobile}>{preview(true)}</div>

          <FlavorSelector quantities={items} onIncrement={handleIncrement} onDecrement={handleDecrement} />

          {/* Celular/tablet: el resumen va debajo de los productos. */}
          <div id={SECTION.summary} className={styles.summaryMobile}>
            {summary}
          </div>
        </section>

        {/* Computadora: vista previa grande + resumen, fijos al costado mientras se baja. */}
        <aside className={styles.orderColumn} aria-label="Tu pedido">
          <div className={styles.sticky}>
            {preview(false)}
            {summary}
          </div>
        </aside>
      </div>

      <section id={SECTION.confirm} className={styles.confirm} aria-labelledby={`${SECTION.confirm}-title`}>
        <div className={`container ${styles.confirmInner}`}>
          <div className={styles.confirmIntro}>
            <SectionHeading id={`${SECTION.confirm}-title`} ref={confirmHeadingRef}>
              Confirmá tu pedido
            </SectionHeading>
            {checkoutOpen ? (
              <OrderSummary boxLines={boxLines} extraLines={extraLines} totalCents={totalCents} compact />
            ) : (
              <p className={styles.confirmHint}>
                {totalCount > 0
                  ? `Tu pedido tiene ${formatCartCount(cookieCount, extraCount)}. Cuando esté listo, completá tus datos.`
                  : "Cuando tengas tu pedido listo, completá tus datos y envianos el pedido por WhatsApp."}
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

      <MobileBoxBar
        totalCount={totalCount}
        label={formatCartCount(cookieCount, extraCount)}
        totalCents={totalCents}
        boxTargetId={SECTION.summary}
        hideWhenVisibleIds={[SECTION.summary, SECTION.confirm]}
      />

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

type SectionHeadingProps = {
  id: string;
  children: React.ReactNode;
  ref?: React.Ref<HTMLHeadingElement>;
};

function SectionHeading({ id, children, ref }: SectionHeadingProps) {
  return (
    <h2 id={id} ref={ref} tabIndex={-1} className={styles.sectionTitle}>
      {children}
    </h2>
  );
}
