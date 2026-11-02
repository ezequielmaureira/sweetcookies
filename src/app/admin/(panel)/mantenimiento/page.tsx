import { MaintenanceSwitch } from "@/components/admin/maintenance/MaintenanceSwitch";
import { MaintenanceTextsForm } from "@/components/admin/maintenance/MaintenanceTextsForm";
import styles from "@/components/admin/Admin.module.css";

export default function AdminMantenimientoPage() {
  return (
    <div className={styles.narrow}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>🍪 Modo mantenimiento</h1>
        <p className={styles.lead}>
          Activalo para mostrar una pantalla temporal a los clientes mientras hacés cambios. Vos seguís teniendo acceso
          completo al panel.
        </p>
      </header>
      <MaintenanceSwitch />
      <MaintenanceTextsForm />
    </div>
  );
}
