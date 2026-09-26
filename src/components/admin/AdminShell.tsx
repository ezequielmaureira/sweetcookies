import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand/Brand";
import { brandImages } from "@/data/cookies";
import { resolveImage } from "@/lib/images";
import { AdminNav } from "./AdminNav";
import { OrdersStatusProvider } from "./orders-status/OrdersStatusProvider";
import { OrdersStatusPill } from "./orders-status/OrdersSwitch";
import styles from "./Admin.module.css";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <OrdersStatusProvider>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={`container ${styles.topbarInner}`}>
            <Link href="/admin" className={styles.brand} aria-label="Sweet Cookies, panel de administración">
              <Brand logoSrc={resolveImage(brandImages.logo)} size="sm" decorative />
              <span className={styles.badge}>Admin</span>
            </Link>
            <div className={styles.topbarActions}>
              <OrdersStatusPill />
              <Link href="/" className={styles.viewSite}>
                Ver web
              </Link>
              <UserButton />
            </div>
          </div>
          <div className="container">
            <AdminNav />
          </div>
        </header>
        <main id="contenido" className={`container ${styles.main}`}>
          {children}
        </main>
      </div>
    </OrdersStatusProvider>
  );
}
