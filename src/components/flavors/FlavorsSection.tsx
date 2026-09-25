import type { Product } from "@/lib/catalog";
import { sectionIds } from "@/data/site";
import { FlavorsList } from "./FlavorsList";
import styles from "./FlavorsSection.module.css";

type FlavorsSectionProps = {
  products: Product[];
  /** true si la API no respondió (se muestra un aviso, nunca datos inventados). */
  unavailable?: boolean;
};

export function FlavorsSection({ products, unavailable = false }: FlavorsSectionProps) {
  return (
    <section id={sectionIds.flavors} className={styles.section} aria-labelledby="flavors-title">
      <div className="container">
        <header className={styles.header} data-reveal>
          <h2 id="flavors-title" className={styles.title}>
            Nuestros sabores
          </h2>
          <p className={styles.subtitle}>Elegí tu favorita. O probalas todas.</p>
        </header>
      </div>

      {products.length > 0 ? (
        <FlavorsList products={products} />
      ) : (
        <div className="container">
          <p className={styles.empty} role="status">
            {unavailable
              ? "No pudimos cargar los sabores en este momento. Probá de nuevo en unos segundos."
              : "Estamos horneando: muy pronto vas a ver nuestros sabores acá."}
          </p>
        </div>
      )}
    </section>
  );
}
