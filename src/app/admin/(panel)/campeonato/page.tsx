import { ChallengeAdmin } from "@/components/admin/challenge/ChallengeAdmin";
import styles from "@/components/admin/Admin.module.css";

export default function AdminChallengePage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="kicker">Sweet Click Challenge</p>
        <h1 className={styles.title}>Campeonato</h1>
        <p className={styles.lead}>
          Torneo semanal con 3 intentos oficiales por participante: lunes a viernes se compite, el sábado se revisa y se confirma el ganador, el domingo está cerrado (hora
          de Córdoba). El ganador se confirma solo al publicar, después de revisar las partidas marcadas.
        </p>
      </header>
      <ChallengeAdmin />
    </>
  );
}
