import { site } from "@/data/site";
import { getPublicSettings, instagramUrl } from "@/lib/site-settings";
import styles from "./Footer.module.css";

export async function Footer() {
  const { instagramHandle } = await getPublicSettings();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.brand}>
          Sweet <em>Cookies</em>
          <span className="visually-hidden"> — {site.tagline}</span>
        </p>

        {instagramHandle && (
          <a className={styles.instagram} href={instagramUrl(instagramHandle)} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
              <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
            </svg>
            <span>
              <span className="visually-hidden">Instagram: </span>
              {instagramHandle}
            </span>
          </a>
        )}
      </div>
    </footer>
  );
}
