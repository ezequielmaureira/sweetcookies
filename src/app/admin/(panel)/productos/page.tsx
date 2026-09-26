import { Suspense } from "react";
import { ProductsAdmin } from "@/components/admin/products/ProductsAdmin";
import styles from "@/components/admin/Admin.module.css";

export default function AdminProductsPage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="kicker">Catálogo</p>
        <h1 className={styles.title}>Productos</h1>
        <p className={styles.lead}>Precio y stock se cambian acá mismo. Para fotos, descripción o vista en caja, entrá a “Editar”.</p>
      </header>
      <Suspense>
        <ProductsAdmin />
      </Suspense>
    </>
  );
}
