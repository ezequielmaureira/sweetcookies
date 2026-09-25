import { OrdersAdmin } from "@/components/admin/orders/OrdersAdmin";
import styles from "@/components/admin/Admin.module.css";

export default function AdminOrdersPage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="kicker">Ventas</p>
        <h1 className={styles.title}>Pedidos</h1>
        <p className={styles.lead}>Los importes y la ganancia de cada pedido son los del momento de la compra.</p>
      </header>
      <OrdersAdmin />
    </>
  );
}
