import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import styles from "./Admin.module.css";

/** Usuario autenticado sin rol admin. */
export function AccessDenied() {
  return (
    <section className={styles.denied} aria-labelledby="denied-title">
      <p className="kicker">Acceso restringido</p>
      <h1 id="denied-title" className={styles.title}>
        No tenés acceso al panel.
      </h1>
      <p className={styles.lead}>Tu cuenta no tiene permisos de administrador.</p>
      <div className={styles.deniedActions}>
        <Link href="/" className={styles.linkButton}>
          Volver a la web
        </Link>
        <SignOutButton redirectUrl="/">
          <button type="button" className={styles.linkButton}>
            Cerrar sesión
          </button>
        </SignOutButton>
      </div>
    </section>
  );
}
