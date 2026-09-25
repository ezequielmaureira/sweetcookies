"use client";

import { useEffect, useState } from "react";
import { formatCookieCount } from "@/lib/cart";
import styles from "./MobileBoxBar.module.css";

type MobileBoxBarProps = {
  totalCount: number;
  boxTargetId: string;
  /** Se oculta mientras alguno de estos elementos está en pantalla. */
  hideWhenVisibleIds: string[];
};

/**
 * Barra compacta fija abajo (solo mobile/tablet): muestra cuántas cookies hay
 * y lleva a la caja. Se oculta cuando la caja o la confirmación están a la vista.
 */
export function MobileBoxBar({ totalCount, boxTargetId, hideWhenVisibleIds }: MobileBoxBarProps) {
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
        Tu caja · <strong>{formatCookieCount(totalCount)}</strong>
      </p>
      <a
        href={`#${boxTargetId}`}
        className={styles.button}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(boxTargetId)?.scrollIntoView({ block: "start" });
        }}
      >
        Ver caja
      </a>
    </div>
  );
}
