"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import { getAdminSiteTexts, saveAdminSiteTexts, type AdminSiteTexts, type SiteTextField } from "@/lib/admin/site-content-api";
import { SITE_TEXT_GUIDES } from "@/lib/admin/site-text-guides";
import { SiteTextGuide } from "./SiteTextGuide";
import styles from "./Admin.module.css";

type LoadState = "loading" | "ready" | "error";
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/** Lo que se ve en cada campo: el texto guardado o, si no hay, el original de la web. */
const valuesFrom = (data: AdminSiteTexts) =>
  Object.fromEntries(data.sections.flatMap((s) => s.fields.map((f) => [f.key, f.value ?? f.defaultValue])));

/**
 * Configuración → Textos del sitio. Todos los textos en un solo formulario,
 * agrupados por sección, con un único "Guardar cambios".
 */
export function SiteTextsForm() {
  const { getToken, isLoaded } = useAuth();
  const uid = useId();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<AdminSiteTexts | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getAdminSiteTexts(await getToken());
        if (cancelled) return;
        setData(loaded);
        setValues(valuesFrom(loaded));
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken]);

  const update = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
    if (save.kind === "saved" || save.kind === "error") setSave({ kind: "idle" });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.kind === "saving" || !data) return;
    setSave({ kind: "saving" });
    try {
      const saved = await saveAdminSiteTexts(await getToken(), values);
      setData(saved);
      setValues(valuesFrom(saved));
      setErrors({});
      setSave({ kind: "saved" });
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 422) setErrors(error.fields);
      setSave({ kind: "error", message: adminErrorMessage(error, "No pudimos guardar los cambios.") });
    }
  };

  if (loadState === "loading") {
    return (
      <p className={styles.status} role="status">
        Cargando textos…
      </p>
    );
  }

  if (loadState === "error" || !data) {
    return (
      <p className={styles.statusError} role="alert">
        No pudimos cargar los textos. Probá recargar la página en unos segundos.
      </p>
    );
  }

  const saving = save.kind === "saving";

  const renderField = (field: SiteTextField, number?: number) => {
    const id = `${uid}-${field.key}`;
    const value = values[field.key] ?? "";
    const error = errors[field.key];
    const describedBy = [field.description ? `${id}-help` : "", `${id}-count`, error ? `${id}-error` : ""].filter(Boolean).join(" ");
    const common = {
      id,
      value,
      maxLength: field.maxLength,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(field.key, e.target.value),
      placeholder: field.defaultValue.replace(/\n/g, " "),
      "aria-invalid": Boolean(error),
      "aria-describedby": describedBy,
    };
    return (
      <div key={field.key} className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor={id} className={styles.label}>
            {number && <span className={styles.fieldNumber}>{number}</span>}
            {field.label}
          </label>
          {value !== field.defaultValue && (
            <button type="button" className={styles.restore} onClick={() => update(field.key, field.defaultValue)}>
              Volver al original
            </button>
          )}
        </div>
        {field.multiline ? (
          <textarea {...common} className={`${styles.input} ${styles.textarea}`} rows={3} />
        ) : (
          <input {...common} type="text" className={styles.input} autoComplete="off" />
        )}
        <div className={styles.fieldFoot}>
          {field.description && (
            <p id={`${id}-help`} className={styles.help}>
              {field.description}
            </p>
          )}
          <span id={`${id}-count`} className={styles.counter}>
            {value.length}/{field.maxLength}
          </span>
        </div>
        {error && (
          <p id={`${id}-error`} className={styles.error}>
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={saving}>
      {data.sections.map((section) => {
        // Se numeran los campos que se ven en la imagen de referencia, en el orden del formulario.
        const guide = SITE_TEXT_GUIDES[section.id];
        const numbers: Record<string, number> = {};
        if (guide) section.fields.filter((f) => guide.boxes[f.key]).forEach((f, i) => (numbers[f.key] = i + 1));
        return (
          <section key={section.id} className={styles.section} aria-labelledby={`${uid}-${section.id}`}>
            <h2 id={`${uid}-${section.id}`} className={styles.sectionTitle}>
              {section.label}
            </h2>
            <p className={styles.sectionLead}>{section.description}</p>
            {guide && <SiteTextGuide guide={guide} numbers={numbers} />}
            {section.fields.map((field) => renderField(field, numbers[field.key]))}
          </section>
        );
      })}

      <p className={styles.help}>Si dejás un campo vacío, la web vuelve a mostrar el texto original.</p>

      <div className={`${styles.actions} ${styles.stickyActions}`}>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        <p className={save.kind === "error" ? styles.statusError : styles.status} role={save.kind === "error" ? "alert" : "status"}>
          {save.kind === "saved" && "Cambios guardados ✓"}
          {save.kind === "error" && save.message}
        </p>
      </div>

      {data.updatedAt && (
        <p className={styles.meta}>
          Última modificación: {new Date(data.updatedAt).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </form>
  );
}
