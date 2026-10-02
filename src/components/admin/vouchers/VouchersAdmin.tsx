"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VoucherStatusBadge } from "@/components/vouchers/VoucherStatusBadge";
import { adminErrorMessage } from "@/lib/admin/admin-api";
import { listVouchers, type AdminVoucherList } from "@/lib/admin/voucher-api";
import { VOUCHER_FILTER_LABELS, boxLabel, formatVoucherDate, formatVoucherDateTime, type AdminVoucher, type VoucherFilter } from "@/lib/vouchers/voucher-format";
import { useCancelVoucher } from "./useCancelVoucher";
import { useDeleteVoucher } from "./useDeleteVoucher";
import styles from "./Vouchers.module.css";

const FILTERS = Object.keys(VOUCHER_FILTER_LABELS) as VoucherFilter[];

/** Historial de vouchers: filtros simples por estado y acciones por fila. */
export function VouchersAdmin() {
  const { getToken, isLoaded } = useAuth();
  const [filter, setFilter] = useState<VoucherFilter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminVoucherList | null>(null);
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const key = `${filter}:${page}`;
  const loading = settledFor !== key;

  useEffect(() => {
    if (!isLoaded) return;
    const current = ++requestId.current;
    (async () => {
      try {
        const result = await listVouchers(await getToken(), filter, page);
        if (current !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (current === requestId.current) setError(adminErrorMessage(e, "No pudimos cargar los vouchers."));
      } finally {
        if (current === requestId.current) setSettledFor(`${filter}:${page}`);
      }
    })();
  }, [filter, page, getToken, isLoaded]);

  // Tras anular: se actualiza la fila (o desaparece si el filtro ya no la incluye).
  const replace = (updated: AdminVoucher) =>
    setData((d) => {
      if (!d) return d;
      const keep = filter === "all" || filter === "cancelled";
      return { ...d, vouchers: keep ? d.vouchers.map((v) => (v.publicId === updated.publicId ? updated : v)) : d.vouchers.filter((v) => v.publicId !== updated.publicId) };
    });
  const { askCancel, dialog, message } = useCancelVoucher(replace);

  // Tras eliminar: la fila desaparece del historial.
  const removeRow = (deleted: AdminVoucher) =>
    setData((d) => (d ? { ...d, total: Math.max(0, d.total - 1), vouchers: d.vouchers.filter((v) => v.publicId !== deleted.publicId) } : d));
  const { askDelete, dialog: deleteDialog, message: deleteMessage } = useDeleteVoucher(removeRow);
  // Eliminado desde el detalle (/admin/vouchers/<id>): vuelve acá con ?eliminado=1.
  const deletedFromDetail = useSearchParams().get("eliminado") === "1";
  const deleteNotice = deleteMessage ?? (deletedFromDetail ? { kind: "ok" as const, text: "Voucher eliminado ✓" } : null);

  const vouchers = data?.vouchers ?? [];

  return (
    <section className={styles.history} aria-labelledby="vouchers-historial">
      <h2 id="vouchers-historial" className={styles.sectionTitle}>
        Historial de vouchers creados
      </h2>

      <div className={styles.filters} role="group" aria-label="Filtrar por estado">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={styles.chip}
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
          >
            {VOUCHER_FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <p className={styles.live} aria-live="polite">
        {loading ? "Cargando…" : data ? `${data.total} ${data.total === 1 ? "voucher" : "vouchers"}` : ""}
      </p>
      {message && (
        <p className={message.kind === "ok" ? styles.ok : styles.error} role="status">
          {message.text}
        </p>
      )}
      {deleteNotice && (
        <p className={deleteNotice.kind === "ok" ? styles.ok : styles.error} role="status">
          {deleteNotice.text}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!error && data && vouchers.length === 0 && !loading && (
        <p className={styles.empty}>{filter === "all" ? "Todavía no creaste vouchers." : `No hay vouchers ${VOUCHER_FILTER_LABELS[filter].toLowerCase()}.`}</p>
      )}

      {vouchers.length > 0 && (
        <div className={styles.tableWrap} aria-busy={loading}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Tipo</th>
                <th scope="col">Válido hasta</th>
                <th scope="col">Estado</th>
                <th scope="col">Creación</th>
                <th scope="col">Canje</th>
                <th scope="col">
                  <span className={styles.visuallyHidden}>Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.publicId}>
                  <th scope="row" className={styles.code}>
                    <Link href={`/admin/vouchers/${v.publicId}`}>{v.code}</Link>
                  </th>
                  <td data-label="Tipo">{boxLabel(v.cookieQuantity)}</td>
                  <td data-label="Válido hasta">{formatVoucherDate(v.expiresAt)}</td>
                  <td data-label="Estado">
                    <VoucherStatusBadge status={v.status} />
                  </td>
                  <td data-label="Creación">{formatVoucherDateTime(v.createdAt)}</td>
                  <td data-label="Canje">{v.redeemedAt ? formatVoucherDateTime(v.redeemedAt) : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.rowActions}>
                    <Link href={`/admin/vouchers/${v.publicId}`} className={styles.rowLink}>
                      Ver
                    </Link>
                    {v.status === "ACTIVE" && (
                      <button type="button" className={styles.rowDanger} onClick={() => askCancel(v)}>
                        Anular
                      </button>
                    )}
                    <button type="button" className={styles.rowDanger} onClick={() => askDelete(v)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav className={styles.pager} aria-label="Páginas">
          <button type="button" className={styles.chip} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span>
            Página {data.page} de {data.totalPages}
          </span>
          <button type="button" className={styles.chip} disabled={page >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </nav>
      )}
      {dialog}
      {deleteDialog}
    </section>
  );
}
