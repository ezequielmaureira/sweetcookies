import { instagramUrl } from "@/lib/settings-parse";
import styles from "./OrdersPausedNotice.module.css";

export const DEFAULT_PAUSED_MESSAGE = "En este momento no estamos tomando nuevos pedidos. Volvé a visitarnos pronto 🍪";

type OrdersPausedNoticeProps = {
  /** Mensaje del negocio (Configuración); vacío = mensaje por defecto. */
  message: string | null;
  instagramHandle?: string | null;
  className?: string;
};

/** Aviso amable (no un error): el negocio pausó los pedidos por un tiempo. */
export function OrdersPausedNotice({ message, instagramHandle, className }: OrdersPausedNoticeProps) {
  return (
    <div className={[styles.notice, className].filter(Boolean).join(" ")} role="status">
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9.5 8.5v7M14.5 8.5v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <div className={styles.text}>
        <p className={styles.title}>Pedidos temporalmente pausados</p>
        <p className={styles.message}>{message || DEFAULT_PAUSED_MESSAGE}</p>
        {instagramHandle && (
          <p className={styles.message}>
            Mientras tanto, seguinos en{" "}
            <a href={instagramUrl(instagramHandle)} target="_blank" rel="noopener noreferrer" className={styles.link}>
              {instagramHandle}
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
