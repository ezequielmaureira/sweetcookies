import { sectionIds } from "@/data/site";
import { FlavorsList } from "./FlavorsList";
import styles from "./FlavorsSection.module.css";

/** "Nuestros sabores": el catálogo real (mismos productos que el admin), siempre fresco. */
export function FlavorsSection({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section id={sectionIds.flavors} className={styles.section} aria-labelledby="flavors-title">
      <div className="container">
        <header className={styles.header} data-reveal>
          <h2 id="flavors-title" className={styles.title}>
            {title}
          </h2>
          <p className={styles.subtitle}>{subtitle}</p>
        </header>
      </div>

      <FlavorsList />
    </section>
  );
}
