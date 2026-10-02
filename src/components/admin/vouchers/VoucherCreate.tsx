"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import { createVoucher } from "@/lib/admin/voucher-api";
import { DEFAULT_VOUCHER_DESCRIPTION, VOUCHER_DESCRIPTION_MAX, todayInArgentina, type AdminVoucher, type VoucherQuantity } from "@/lib/vouchers/voucher-format";
import { VoucherSheet } from "./VoucherSheet";
import { useCancelVoucher } from "./useCancelVoucher";
import styles from "./Vouchers.module.css";

const QUANTITIES: VoucherQuantity[] = [4, 6];

/** Crear voucher: solo tipo de caja (4 o 6) y fecha límite de canje. */
export function VoucherCreate() {
  const { getToken } = useAuth();
  const uid = useId();
  const [quantity, setQuantity] = useState<VoucherQuantity | null>(null);
  const [validUntil, setValidUntil] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminVoucher | null>(null);
  const { askCancel, dialog, message } = useCancelVoucher(setCreated);
  const today = todayInArgentina();

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quantity || !validUntil || saving) return;
    setSaving(true);
    setError(null);
    try {
      setCreated(await createVoucher(await getToken(), { cookieQuantity: quantity, validUntil, description: description.trim() }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      const fields = e instanceof AdminApiError ? e.fields : {};
      setError(fields.validUntil ?? fields.cookieQuantity ?? fields.description ?? adminErrorMessage(e, "No pudimos generar el voucher."));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setCreated(null);
    setQuantity(null);
    setValidUntil("");
    setDescription("");
    setError(null);
    window.scrollTo({ top: 0 });
  };

  if (created) {
    return (
      <section aria-labelledby={`${uid}-done`}>
        <h2 id={`${uid}-done`} className={styles.doneTitle}>
          {created.status === "ACTIVE" ? "Voucher creado ✓" : "Voucher"}
        </h2>
        {message && (
          <p className={message.kind === "ok" ? styles.ok : styles.error} role="status">
            {message.text}
          </p>
        )}
        <VoucherSheet voucher={created} onCancel={() => askCancel(created)}>
          <Button variant="secondary" onClick={reset}>
            Crear otro
          </Button>
        </VoucherSheet>
        <Link href="/admin/vouchers" className={styles.backLink}>
          ← Volver a vouchers
        </Link>
        {dialog}
      </section>
    );
  }

  return (
    <form className={styles.form} onSubmit={generate} noValidate>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Tipo de voucher</legend>
        <div className={styles.typeGrid}>
          {QUANTITIES.map((q) => (
            <label key={q} className={styles.typeOption}>
              <input type="radio" name="cookieQuantity" value={q} checked={quantity === q} onChange={() => setQuantity(q)} />
              <span className={styles.typeCard}>
                <span className={styles.typeNumber}>{q}</span>
                <span className={styles.typeLabel}>Caja de {q} cookies</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.field}>
        <label htmlFor={`${uid}-date`} className={styles.legend}>
          Válido hasta
        </label>
        <input
          id={`${uid}-date`}
          type="date"
          className={styles.dateInput}
          min={today}
          value={validUntil}
          required
          onChange={(e) => setValidUntil(e.target.value)}
          aria-describedby={`${uid}-date-help`}
        />
        <p id={`${uid}-date-help`} className={styles.help}>
          Fecha límite para canjearlo (incluye todo ese día).
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${uid}-description`} className={styles.legend}>
          Descripción
        </label>
        <input
          id={`${uid}-description`}
          type="text"
          className={styles.textInput}
          maxLength={VOUCHER_DESCRIPTION_MAX}
          value={description}
          placeholder={DEFAULT_VOUCHER_DESCRIPTION}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${uid}-description-help`}
        />
        <p id={`${uid}-description-help`} className={styles.help}>
          Ej.: Premio sorteo aniversario, Voucher cortesía, Regalo especial. Si lo dejás vacío dice “{DEFAULT_VOUCHER_DESCRIPTION}”. ({description.length}/
          {VOUCHER_DESCRIPTION_MAX})
        </p>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className={styles.generate} disabled={!quantity || !validUntil || saving}>
        {saving ? "Generando…" : "Generar voucher"}
      </Button>
    </form>
  );
}
