"use client";

import { useEffect } from "react";

/**
 * Observa todos los elementos con [data-reveal] y les agrega .is-visible
 * cuando entran en pantalla. Un único observer para toda la página; también
 * toma los que aparecen después (ej. el catálogo que se refresca en el cliente).
 */
export function RevealObserver() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    elements.forEach((el) => observer.observe(el));

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const found = node.matches("[data-reveal]") ? [node] : [];
          found.push(...node.querySelectorAll<HTMLElement>("[data-reveal]"));
          found.filter((el) => !el.classList.contains("is-visible")).forEach((el) => observer.observe(el));
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return null;
}
