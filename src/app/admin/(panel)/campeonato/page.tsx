import { ChallengeAdmin } from "@/components/admin/challenge/ChallengeAdmin";
import styles from "@/components/admin/Admin.module.css";

export default function AdminChallengePage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="kicker">Sweet Click Challenge</p>
        <h1 className={styles.title}>Torneos</h1>
        <p className={styles.lead}>
          Creá y programá torneos con sus propias fechas, premio e intentos. Se activan y finalizan solos según sus fechas (hora de Córdoba). El ganador se
          confirma solo cuando lo publicás, después de revisar los resultados.
        </p>
      </header>
      <ChallengeAdmin />
    </>
  );
}
