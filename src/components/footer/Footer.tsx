import { site } from "@/data/site";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.brand}>
          Sweet <em>Cookies</em>
        </p>

        <a className={styles.instagram} href={site.instagram.url} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
          </svg>
          <span>
            <span className="visually-hidden">Instagram: </span>
            {site.instagram.handle}
          </span>
        </a>
      </div>
    </footer>
  );
}
