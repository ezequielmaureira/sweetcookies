"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";
import {
  ORDER_SORT_LABELS,
  adminErrorMessage,
  getOrder,
  listOrders,
  type AdminOrderDetail,
  type AdminOrderList,
  type AdminOrderRow,
  type OrderFilters,
  type OrderSort,
} from "@/lib/admin/admin-api";
import { formatPrice } from "@/lib/catalog";
import styles from "./Orders.module.css";

const INITIAL: OrderFilters = { q: "", from: "", to: "", sort: "recent", page: 1 };
const TIME_ZONE = "America/Argentina/Buenos_Aires";

const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });

const STATUS_LABELS: Record<AdminOrderRow["status"], string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

const customerName = (o: Pick<AdminOrderRow, "customerName" | "customerLastName">) => [o.customerName, o.customerLastName].filter(Boolean).join(" ");

function formatPhone(digits: string | null) {
  if (!digits) return null;
  return digits.length > 6 ? `${digits.slice(0, -4)} ${digits.slice(-4)}` : digits;
}

export function OrdersAdmin() {
  const { getToken, isLoaded } = useAuth();
  const uid = useId();
  const [filters, setFilters] = useState<OrderFilters>(INITIAL);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<AdminOrderList | null>(null);
  // Filtros de la última respuesta (o error) recibida: si difieren de los actuales, está cargando.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filtersKey = JSON.stringify(filters);
  const loading = settledFor !== filtersKey;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AdminOrderDetail | "loading" | "error">>({});
  const requestId = useRef(0);

  // La búsqueda espera a que se termine de escribir (sin pedir en cada tecla).
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 })), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!isLoaded) return;
    const current = ++requestId.current;
    const key = JSON.stringify(filters);
    (async () => {
      try {
        const result = await listOrders(await getToken(), filters);
        if (current !== requestId.current) return; // Llegó una respuesta vieja: se descarta.
        setData(result);
        setError(null);
      } catch (e) {
        if (current === requestId.current) setError(adminErrorMessage(e, "No pudimos cargar los pedidos."));
      } finally {
        if (current === requestId.current) setSettledFor(key);
      }
    })();
  }, [filters, getToken, isLoaded]);

  const set = <K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) => setFilters((f) => ({ ...f, [key]: value, page: key === "page" ? (value as number) : 1 }));

  const toggle = async (order: AdminOrderRow) => {
    if (expanded === order.id) {
      setExpanded(null);
      return;
    }
    setExpanded(order.id);
    if (details[order.id] && details[order.id] !== "error") return;
    setDetails((d) => ({ ...d, [order.id]: "loading" }));
    try {
      const detail = await getOrder(await getToken(), order.id);
      setDetails((d) => ({ ...d, [order.id]: detail }));
    } catch {
      setDetails((d) => ({ ...d, [order.id]: "error" }));
    }
  };

  const hasFilters = Boolean(filters.q || filters.from || filters.to);
  const summary = data?.summary;

  return (
    <div className={styles.orders}>
      <section className={styles.summary} aria-label="Resumen de los pedidos filtrados" aria-busy={loading}>
        <div className={styles.stat}>
          <p className={styles.statLabel}>Pedidos</p>
          <p className={styles.statValue}>{summary ? summary.orders : "—"}</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statLabel}>Facturación</p>
          <p className={styles.statValue}>{summary ? formatPrice(summary.revenue) : "—"}</p>
        </div>
        <div className={`${styles.stat} ${styles.statProfit}`}>
          <p className={styles.statLabel}>Ganancia</p>
          <p className={styles.statValue}>{summary ? formatPrice(summary.profit) : "—"}</p>
        </div>
      </section>

      <form className={styles.filters} role="search" onSubmit={(e) => e.preventDefault()}>
        <div className={`${styles.filter} ${styles.searchFilter}`}>
          <label htmlFor={`${uid}-q`} className={styles.filterLabel}>
            Buscar cliente
          </label>
          <input
            id={`${uid}-q`}
            type="search"
            className={styles.input}
            placeholder="Nombre, apellido, teléfono o email"
            value={search}
            maxLength={80}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filter}>
          <label htmlFor={`${uid}-from`} className={styles.filterLabel}>
            Desde
          </label>
          <input id={`${uid}-from`} type="date" className={styles.input} value={filters.from} max={filters.to || undefined} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div className={styles.filter}>
          <label htmlFor={`${uid}-to`} className={styles.filterLabel}>
            Hasta
          </label>
          <input id={`${uid}-to`} type="date" className={styles.input} value={filters.to} min={filters.from || undefined} onChange={(e) => set("to", e.target.value)} />
        </div>
        <div className={styles.filter}>
          <label htmlFor={`${uid}-sort`} className={styles.filterLabel}>
            Ordenar
          </label>
          <select id={`${uid}-sort`} className={styles.input} value={filters.sort} onChange={(e) => set("sort", e.target.value as OrderSort)}>
            {(Object.keys(ORDER_SORT_LABELS) as OrderSort[]).map((sort) => (
              <option key={sort} value={sort}>
                {ORDER_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setSearch("");
              setFilters((f) => ({ ...INITIAL, sort: f.sort }));
            }}
          >
            Limpiar filtros
          </button>
        )}
      </form>

      <p className={styles.live} role="status">
        {loading ? "Cargando pedidos…" : error ? "" : data && `${data.summary.orders} ${data.summary.orders === 1 ? "pedido" : "pedidos"}${hasFilters ? " con estos filtros" : ""}.`}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {data && data.orders.length === 0 && !loading && (
        <p className={styles.empty}>{hasFilters ? "No hay pedidos que coincidan con la búsqueda." : "Todavía no hay pedidos."}</p>
      )}

      {data && data.orders.length > 0 && (
        <ul className={styles.list} aria-busy={loading}>
          <li className={styles.headRow} aria-hidden="true">
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Fecha</span>
            <span className={styles.num}>Importe</span>
            <span className={styles.num}>Ganancia</span>
            <span />
          </li>
          {data.orders.map((order) => {
            const open = expanded === order.id;
            const detail = details[order.id];
            return (
              <li key={order.id} className={[styles.row, open ? styles.rowOpen : ""].join(" ")}>
                <button type="button" className={styles.rowButton} aria-expanded={open} aria-controls={`${uid}-${order.id}`} onClick={() => toggle(order)}>
                  <span className={styles.number}>#{order.number}</span>
                  <span className={styles.customer}>
                    <span className={styles.customerName}>{customerName(order)}</span>
                    <span className={styles.customerMeta}>
                      {[formatPhone(order.customerPhone), order.customerEmail].filter(Boolean).join(" · ") || "Sin contacto"}
                    </span>
                  </span>
                  <span className={styles.date}>{dateTime.format(new Date(order.createdAt))}</span>
                  <span className={`${styles.num} ${styles.total}`}>
                    <span className={styles.mobileLabel}>Importe </span>
                    {formatPrice(order.total)}
                  </span>
                  <span className={`${styles.num} ${styles.profit}`}>
                    <span className={styles.mobileLabel}>Ganancia </span>
                    {formatPrice(order.profit)}
                  </span>
                  <span className={styles.chevron} aria-hidden="true">
                    <svg viewBox="0 0 16 16">
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {open && (
                  <div id={`${uid}-${order.id}`} className={styles.detail}>
                    {detail === "loading" && <p className={styles.live}>Cargando detalle…</p>}
                    {detail === "error" && <p className={styles.error}>No pudimos cargar el detalle.</p>}
                    {detail && typeof detail === "object" && <OrderDetail order={detail} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <nav className={styles.pager} aria-label="Páginas de pedidos">
          <button type="button" className={styles.pageButton} disabled={filters.page <= 1 || loading} onClick={() => set("page", filters.page - 1)}>
            ← Anteriores
          </button>
          <span className={styles.pageInfo}>
            Página {data.page} de {data.totalPages}
          </span>
          <button type="button" className={styles.pageButton} disabled={filters.page >= data.totalPages || loading} onClick={() => set("page", filters.page + 1)}>
            Siguientes →
          </button>
        </nav>
      )}
    </div>
  );
}

/** Detalle con los valores HISTÓRICOS guardados al comprar (snapshots). */
function OrderDetail({ order }: { order: AdminOrderDetail }) {
  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailInfo}>
        <p>
          <strong>{order.deliveryMethod === "DELIVERY" ? "Envío" : "Retiro"}</strong>
          {order.deliveryAddress && ` · ${order.deliveryAddress}`}
        </p>
        <p className={styles.muted}>Estado: {STATUS_LABELS[order.status]}</p>
        {order.notes && <p className={styles.notes}>“{order.notes}”</p>}
      </div>
      <table className={styles.items}>
        <caption className="visually-hidden">Productos del pedido #{order.number}</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col" className={styles.num}>
              Cant.
            </th>
            <th scope="col" className={styles.num}>
              Precio u.
            </th>
            <th scope="col" className={styles.num}>
              Costo u.
            </th>
            <th scope="col" className={styles.num}>
              Subtotal
            </th>
            <th scope="col" className={styles.num}>
              Ganancia
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={`${item.productId ?? "deleted"}-${i}`}>
              <th scope="row">
                {item.productName}
                {!item.productId && <span className={styles.muted}> (eliminado)</span>}
              </th>
              <td className={styles.num}>{item.quantity}</td>
              <td className={styles.num}>{formatPrice(item.unitPrice)}</td>
              <td className={styles.num}>{formatPrice(item.unitCost)}</td>
              <td className={styles.num}>{formatPrice(item.subtotal)}</td>
              <td className={styles.num}>{formatPrice(item.profit)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className={styles.num}>{order.itemCount}</td>
            <td />
            <td />
            <td className={styles.num}>{formatPrice(order.total)}</td>
            <td className={styles.num}>{formatPrice(order.profit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
