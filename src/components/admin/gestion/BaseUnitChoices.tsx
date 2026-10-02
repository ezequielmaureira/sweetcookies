import { BASE_UNIT_LABELS, type BaseUnit } from "@/lib/admin/gestion";
import styles from "./Gestion.module.css";

/** "¿Cómo se mide?" al crear un ingrediente: Gramos / Mililitros / Unidades (tres botones grandes). */
export function BaseUnitChoices({ name, value, onChange, disabled = false }: { name: string; value: BaseUnit; onChange: (unit: BaseUnit) => void; disabled?: boolean }) {
  return (
    <div className={styles.choices}>
      {(Object.keys(BASE_UNIT_LABELS) as BaseUnit[]).map((unit) => (
        <label key={unit} className={styles.choice}>
          <input type="radio" name={name} value={unit} checked={value === unit} disabled={disabled} onChange={() => onChange(unit)} />
          {BASE_UNIT_LABELS[unit]}
        </label>
      ))}
    </div>
  );
}
