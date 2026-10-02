import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import gestionStyles from "@/components/admin/gestion/Gestion.module.css";
import styles from "@/components/admin/Admin.module.css";

/** /admin/gestion: ingredientes y recetas (costos). */
export default function GestionHomePage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <Link href="/admin" className={styles.back}>
          ← Panel
        </Link>
        <h1 className={styles.title}>Gestión</h1>
        <p className={styles.lead}>Cargá lo que comprás y cuánto pagaste: el sistema calcula el costo real de cada cookie.</p>
      </header>
      <div className={gestionStyles.homeCards}>
        <section className={gestionStyles.homeCard}>
          <h2>Ingredientes</h2>
          <p>Administrá ingredientes, precios y costos.</p>
          <ButtonLink href="/admin/gestion/ingredientes" arrow>
            Ver ingredientes
          </ButtonLink>
        </section>
        <section className={gestionStyles.homeCard}>
          <h2>Recetas</h2>
          <p>Creá recetas y conocé el costo real de cada cookie.</p>
          <ButtonLink href="/admin/gestion/recetas" arrow>
            Ver recetas
          </ButtonLink>
        </section>
        <section className={gestionStyles.homeCard}>
          <h2>Simulador</h2>
          <p>Calculá ingredientes y costos para una producción.</p>
          <ButtonLink href="/admin/gestion/simulador" arrow>
            Abrir simulador
          </ButtonLink>
        </section>
      </div>
    </div>
  );
}
