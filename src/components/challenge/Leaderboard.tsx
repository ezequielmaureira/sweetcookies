import type { LeaderRow } from "@/lib/challenge/challenge-api";
import styles from "./Leaderboard.module.css";

const MEDALS = ["gold", "silver", "bronze"] as const;

type LeaderboardProps = {
  rows: LeaderRow[] | null;
  /** @ del jugador de este navegador, para resaltar su fila. */
  myHandle: string | null;
  prize: string;
};

/** Top 10 semanal: solo @, mordidas y cookies (nunca IP, teléfonos ni identificadores privados). */
export function Leaderboard({ rows, myHandle, prize }: LeaderboardProps) {
  return (
    <section id="ranking" className={styles.board} aria-labelledby="ranking-title">
      <div className={styles.head}>
        <h2 id="ranking-title" className={styles.title}>
          Ranking semanal
        </h2>
        <p className={styles.note}>Solo el primer puesto gana una {prize.toLowerCase()}.</p>
      </div>

      {rows === null ? (
        <p className={styles.empty}>Cargando ranking…</p>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>Todavía no hay resultados esta semana. ¡Sé el primero!</p>
      ) : (
        <ol className={styles.list}>
          <li className={styles.columns} aria-hidden="true">
            <span>Puesto</span>
            <span>Usuario</span>
            <span className={styles.num}>Mordidas</span>
            <span className={styles.num}>Cookies</span>
          </li>
          {rows.map((row) => {
            const medal = MEDALS[row.position - 1];
            const mine = myHandle !== null && row.handle === myHandle;
            return (
              <li key={row.position} className={[styles.row, medal ? styles[medal] : "", mine ? styles.mine : ""].join(" ")}>
                <span className={styles.position}>
                  <span className={styles.badge}>{row.position}</span>
                </span>
                <span className={styles.alias}>
                  {row.handle}
                  {mine && <span className={styles.you}>vos</span>}
                </span>
                <span className={`${styles.num} ${styles.score}`}>
                  {row.score}
                  <span className="visually-hidden"> mordidas</span>
                </span>
                <span className={`${styles.num} ${styles.cookies}`}>
                  {row.cookies}
                  <span className="visually-hidden"> cookies</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
