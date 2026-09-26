"use client";

import { useEffect, useState } from "react";
import { formatCookieCount } from "@/lib/cart";
import { formatCents } from "@/lib/catalog";
import styles from "./MobileBoxBar.module.css";

type MobileBoxBarProps = {
  totalCount: number;
  /** Total estimado (se muestra junto a la cantidad). */
  totalCents: number;
  boxTargetId: string;
  /** Se oculta mientras alguno de estos elementos está en pantalla. */
  hideWhenVisibleIds: string[];
};

/**
 * Barra compacta fija abajo (solo mobile/tablet): cantidad + total y
 * "Continuar", que lleva al resumen del pedido. Se oculta cuando el resumen o
 * la confirmación están a la vista (la caja en vivo ya se ve arriba).
 */
export function MobileBoxBar({ totalCount, totalCents, boxTargetId, hideWhenVisibleIds }: MobileBoxBarProps) {
  const [targetsVisible, setTargetsVisible] = useState(true);
  const ids = hideWhenVisibleIds.join(",");

  useEffect(() => {
    const elements = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length || !("IntersectionObserver" in window)) return;

    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
        setTargetsVisible(visible.size > 0);
      },
      { threshold: 0.05 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  const show = totalCount > 0 && !targetsVisible;

  return (
    <div className={[styles.bar, show ? styles.visible : ""].join(" ")} inert={!show}>
      <p className={styles.count}>
        <span className={styles.dot} aria-hidden="true" />
        <strong>{formatCookieCount(totalCount)}</strong> · {formatCents(totalCents)}
      </p>
      <a
        href={`#${boxTargetId}`}
        className={styles.button}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(boxTargetId)?.scrollIntoView({ block: "start" });
        }}
      >
        Continuar
      </a>
    </div>
  );
}
