"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { navLinks, sectionIds, site } from "@/data/site";
import { CartButton } from "./CartButton";
import styles from "./Header.module.css";

type HeaderProps = {
  /** Ruta del logo real, o null para usar el logotipo tipográfico. */
  logoSrc: string | null;
};

export function Header({ logoSrc }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Menú mobile: Escape para cerrar, foco al primer link y cierre al pasar a desktop.
  useEffect(() => {
    if (!menuOpen) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => mq.matches && setMenuOpen(false);

    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onChange);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={[styles.header, scrolled || menuOpen ? styles.scrolled : ""].join(" ")}>
      <div className={`container ${styles.inner}`}>
        <Link href={`#${sectionIds.home}`} className={styles.logo} aria-label={`${site.name}, ir al inicio`} onClick={closeMenu}>
          {logoSrc ? (
            <span className={styles.logoImage}>
              <Image src={logoSrc} alt="" fill sizes="160px" priority />
            </span>
          ) : (
            <span className={styles.wordmark} aria-hidden="true">
              Sweet <em>Cookies</em>
            </span>
          )}
        </Link>

        <nav className={styles.nav} aria-label="Principal">
          <ul>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={link.href === `#${sectionIds.buildBox}` ? styles.navCta : styles.navLink}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <CartButton />
          <button
            ref={toggleRef}
            type="button"
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.menuBars} aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div
        id={menuId}
        ref={panelRef}
        className={[styles.mobilePanel, menuOpen ? styles.mobilePanelOpen : ""].join(" ")}
        inert={!menuOpen}
      >
        <nav aria-label="Menú mobile">
          <ul className="container">
            {navLinks.map((link, i) => (
              <li key={link.href} style={{ "--i": i } as React.CSSProperties}>
                <Link href={link.href} className={styles.mobileLink} onClick={closeMenu}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
