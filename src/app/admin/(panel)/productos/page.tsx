import { ProductsAdmin } from "@/components/admin/products/ProductsAdmin";
import styles from "@/components/admin/Admin.module.css";

export default function AdminProductsPage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="kicker">Catálogo</p>
        <h1 className={styles.title}>Productos</h1>
        <p className={styles.lead}>Lo que cargues acá es lo que ve el comprador: precio, stock y destacados, al instante.</p>
      </header>
      <ProductsAdmin />
    </>
  );
}
