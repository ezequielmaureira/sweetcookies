import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import styles from "./Admin.module.css";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={`container ${styles.topbarInner}`}>
          <Link href="/admin" className={styles.brand}>
            Sweet <em>Cookies</em> <span className={styles.badge}>Admin</span>
          </Link>
          <div className={styles.topbarActions}>
            <Link href="/" className={styles.viewSite}>
              Ver web
            </Link>
            <UserButton />
          </div>
        </div>
      </header>
      <main id="contenido" className={`container ${styles.main}`}>
        {children}
      </main>
    </div>
  );
}
