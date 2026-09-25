import Link from "next/link";
import { Brand } from "@/components/brand/Brand";
import { brandImages } from "@/data/cookies";
import { site } from "@/data/site";
import { ADMIN_HOME_URL } from "@/lib/admin/config";
import { resolveImage } from "@/lib/images";
import { getPublicSettings, instagramUrl } from "@/lib/site-settings";
import styles from "./Footer.module.css";

export async function Footer() {
  const { instagramHandle } = await getPublicSettings();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.brand}>
          <Brand logoSrc={resolveImage(brandImages.logo)} size="sm" />
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

        {/* Acceso discreto al panel. No es una medida de seguridad: el acceso real lo
            controlan Clerk + ADMIN_EMAILS en el servidor. */}
        <Link href={ADMIN_HOME_URL} className={styles.admin} prefetch={false} rel="nofollow">
          Administrador
        </Link>
      </div>
    </footer>
  );
}
