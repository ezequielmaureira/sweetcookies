import { BeagleMascot } from "@/components/beagle/BeagleMascot";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/data/site";
import styles from "./FinalCTA.module.css";

export function FinalCTA() {
  return (
    <section className={styles.section} aria-labelledby="final-cta-title">
      <div className={`container ${styles.inner}`} data-reveal>
        <BeagleMascot variant="gazing" initialBubble={null} className={styles.beagle} />
        <h2 id="final-cta-title" className={styles.title}>
          ¿Ya elegiste tus <em>favoritas</em>?
        </h2>
        <ButtonLink href={routes.buildBox} arrow>
          Armá tu caja
        </ButtonLink>
      </div>
    </section>
  );
}
