import Link from "next/link";
import { OrdersSwitch } from "@/components/admin/orders-status/OrdersSwitch";
import { ButtonLink } from "@/components/ui/Button";
import styles from "@/components/admin/Admin.module.css";

const SECTIONS = [
  { href: "/admin/productos", title: "Productos", text: "Catálogo, precios, costos, stock y destacados." },
  { href: "/admin/pedidos", title: "Pedidos", text: "Pedidos, facturación y ganancia, con filtros." },
  { href: "/admin/configuracion", title: "Configuración", text: "Teléfono de pedidos, Instagram y mensaje de pausa." },
];

export default function AdminHomePage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="kicker">Panel</p>
        <h1 className={styles.title}>Hola.</h1>
        <p className={styles.lead}>Desde acá manejás Sweet Cookies: lo que cambies se ve en la web al instante.</p>
      </header>

      <OrdersSwitch />

      {/* TEMPORAL: acceso de prueba a la demo "Descubrí el relleno". Se elimina cuando se conecte a los productos. */}
      <p style={{ marginBottom: 32 }}>
        <ButtonLink href="/descubri-el-relleno" variant="secondary" arrow>
          🍪 Probar “Descubrí el relleno”
        </ButtonLink>
      </p>

      <ul className={styles.cards}>
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link href={section.href} className={styles.card}>
              <span className={styles.cardTitle}>{section.title}</span>
              <span className={styles.cardText}>{section.text}</span>
              <span className={styles.cardArrow} aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
