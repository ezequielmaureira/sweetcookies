import type { Flavor } from "@/data/cookies";
import { sectionIds } from "@/data/site";
import { FlavorsList } from "./FlavorsList";
import styles from "./FlavorsSection.module.css";

export type FlavorWithImage = { flavor: Flavor; imageSrc: string | null };

type FlavorsSectionProps = {
  items: FlavorWithImage[];
};

export function FlavorsSection({ items }: FlavorsSectionProps) {
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

      <FlavorsList items={items} />
    </section>
  );
}
