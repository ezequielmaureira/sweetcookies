"use client";

import { useState } from "react";
import type { Flavor } from "@/data/cookies";
import { CookieCard } from "./CookieCard";
import type { FlavorWithImage } from "./FlavorsSection";
import styles from "./FlavorsSection.module.css";

export function FlavorsList({ items }: { items: FlavorWithImage[] }) {
  const [announcement, setAnnouncement] = useState("");

  const handleAdded = (flavor: Flavor) => {
    // Un carácter invisible distinto fuerza a repetir el anuncio si se agrega el mismo sabor.
    setAnnouncement((prev) => `${flavor.name} agregada al carrito${prev.endsWith("​") ? "" : "​"}`);
  };

  return (
    <>
      <div className={styles.scroller}>
        <ul className={`container ${styles.list}`}>
          {items.map(({ flavor, imageSrc }, i) => (
            <li
              key={flavor.id}
              className={styles.item}
              data-reveal
              style={{ "--reveal-delay": `${(i % 3) * 90}ms` } as React.CSSProperties}
            >
              <CookieCard flavor={flavor} imageSrc={imageSrc} onAdded={handleAdded} />
            </li>
          ))}
        </ul>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
