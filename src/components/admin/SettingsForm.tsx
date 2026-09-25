"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminApiError,
  getAdminSettings,
  saveAdminSettings,
  type FieldErrors,
  type SettingsInput,
} from "@/lib/admin/settings-api";
import styles from "./Admin.module.css";

type LoadState = "loading" | "ready" | "error";
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const WHATSAPP_PATTERN = /^\d{8,15}$/;

export function SettingsForm() {
  const { getToken, isLoaded } = useAuth();
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [values, setValues] = useState<SettingsInput>({ whatsappNumber: "", instagramHandle: "", whatsappOrdersEnabled: true });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await getAdminSettings(await getToken());
        if (cancelled) return;
        setValues({
          whatsappNumber: settings.whatsappNumber ?? "",
          instagramHandle: settings.instagramHandle ?? "",
          whatsappOrdersEnabled: settings.whatsappOrdersEnabled,
        });
        setUpdatedAt(settings.updatedAt);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken]);

  const update = <K extends keyof SettingsInput>(field: K, value: SettingsInput[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (save.kind === "saved" || save.kind === "error") setSave({ kind: "idle" });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.kind === "saving") return;

    // Validación rápida en el cliente (la definitiva es la del servidor).
    const digits = values.whatsappNumber.replace(/\D/g, "");
    const clientErrors: FieldErrors = {};
    if (values.whatsappNumber.trim() && !WHATSAPP_PATTERN.test(digits)) {
      clientErrors.whatsappNumber = "Ingresá entre 8 y 15 dígitos, con código de país.";
    }
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }

    setSave({ kind: "saving" });
    try {
      const saved = await saveAdminSettings(await getToken(), { ...values, whatsappNumber: digits });
      setValues({
        whatsappNumber: saved.whatsappNumber ?? "",
        instagramHandle: saved.instagramHandle ?? "",
        whatsappOrdersEnabled: saved.whatsappOrdersEnabled,
      });
      setUpdatedAt(saved.updatedAt);
      setErrors({});
      setSave({ kind: "saved" });
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 422) {
        setErrors(error.fields);
        setSave({ kind: "error", message: "Revisá los campos marcados." });
      } else if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) {
        setSave({ kind: "error", message: "Tu sesión no tiene permisos para guardar. Volvé a ingresar." });
      } else {
        setSave({ kind: "error", message: "No pudimos guardar los cambios." });
      }
    }
  };

  if (loadState === "loading") {
    return (
      <p className={styles.status} role="status">
        Cargando configuración…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <p className={styles.statusError} role="alert">
        No pudimos cargar la configuración. Probá recargar la página en unos segundos.
      </p>
    );
  }

  const saving = save.kind === "saving";

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <div className={styles.field}>
        <label htmlFor={id("whatsapp")} className={styles.label}>
          Número de WhatsApp
        </label>
        <input
          id={id("whatsapp")}
          className={styles.input}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          placeholder="549XXXXXXXXXX"
          maxLength={20}
          value={values.whatsappNumber}
          onChange={(e) => update("whatsappNumber", e.target.value)}
          aria-invalid={Boolean(errors.whatsappNumber)}
          aria-describedby={`${id("whatsapp-help")}${errors.whatsappNumber ? ` ${id("whatsapp-error")}` : ""}`}
        />
        <p id={id("whatsapp-help")} className={styles.help}>
          Usá código de país y área, sin + ni espacios. Dejalo vacío para no recibir pedidos por WhatsApp.
        </p>
        {errors.whatsappNumber && (
          <p id={id("whatsapp-error")} className={styles.error}>
            {errors.whatsappNumber}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor={id("instagram")} className={styles.label}>
          Instagram
        </label>
        <input
          id={id("instagram")}
          className={styles.input}
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="@usuario"
          maxLength={60}
          value={values.instagramHandle}
          onChange={(e) => update("instagramHandle", e.target.value)}
          aria-invalid={Boolean(errors.instagramHandle)}
          aria-describedby={errors.instagramHandle ? id("instagram-error") : undefined}
        />
        {errors.instagramHandle && (
          <p id={id("instagram-error")} className={styles.error}>
            {errors.instagramHandle}
          </p>
        )}
      </div>

      <div className={styles.toggleRow}>
        <div>
          <p id={id("orders-label")} className={styles.label}>
            Pedidos por WhatsApp
          </p>
          <p id={id("orders-help")} className={styles.help}>
            {values.whatsappOrdersEnabled
              ? "Activos: los clientes pueden enviar pedidos."
              : "Pausados: la web muestra que los pedidos están pausados."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={values.whatsappOrdersEnabled}
          aria-labelledby={id("orders-label")}
          aria-describedby={id("orders-help")}
          className={styles.switch}
          onClick={() => update("whatsappOrdersEnabled", !values.whatsappOrdersEnabled)}
        >
          <span className={styles.switchLabel}>{values.whatsappOrdersEnabled ? "ON" : "OFF"}</span>
          <span className={styles.switchThumb} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.actions}>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        <p
          className={save.kind === "error" ? styles.statusError : styles.status}
          role={save.kind === "error" ? "alert" : "status"}
        >
          {save.kind === "saved" && "Configuración guardada."}
          {save.kind === "error" && save.message}
        </p>
      </div>

      {updatedAt && (
        <p className={styles.meta}>
          Última modificación:{" "}
          {new Date(updatedAt).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </form>
  );
}
