import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/data/site";
import styles from "./FinalCTA.module.css";

export function FinalCTA({ title, buttonLabel }: { title: string; buttonLabel: string }) {
  return (
    <section className={styles.section} aria-labelledby="final-cta-title">
      <div className={`container ${styles.inner}`} data-reveal>
        <h2 id="final-cta-title" className={styles.title}>
          {title}
        </h2>
        <ButtonLink href={routes.buildBox} arrow>
          {buttonLabel}
        </ButtonLink>
      </div>
    </section>
  );
}
