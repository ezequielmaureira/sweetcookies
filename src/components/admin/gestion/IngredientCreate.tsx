"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import { createIngredient, type BaseUnit } from "@/lib/admin/gestion";
import adminStyles from "../Admin.module.css";
import { BaseUnitChoices } from "./BaseUnitChoices";

/** /admin/gestion/ingredientes/nuevo: nombre + unidad base. El precio se carga después. */
export function IngredientCreate() {
  const { getToken } = useAuth();
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState("");
  const [baseUnit, setBaseUnit] = useState<BaseUnit>("GRAM");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setErrors({ name: "Escribí un nombre." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await createIngredient(await getToken(), { name, baseUnit });
      // Directo al ingrediente, con el formulario de precio abierto.
      router.push(`/admin/gestion/ingredientes/${created.id}?nuevo=1`);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 422) setErrors(e.fields);
      setMessage(adminErrorMessage(e, "No pudimos crear el ingrediente."));
      setSaving(false);
    }
  };

  return (
    <form className={adminStyles.form} onSubmit={submit} noValidate>
      <section className={adminStyles.section}>
        <div className={adminStyles.field}>
          <label htmlFor={`${uid}-name`} className={adminStyles.label}>
            Nombre
          </label>
          <input
            id={`${uid}-name`}
            className={adminStyles.input}
            value={name}
            maxLength={80}
            placeholder="Ej.: Nutella"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              setErrors({});
            }}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <p className={adminStyles.error}>{errors.name}</p>}
        </div>

        <fieldset className={adminStyles.field}>
          <legend className={adminStyles.label}>Unidad base</legend>
          <BaseUnitChoices name={`${uid}-unit`} value={baseUnit} onChange={setBaseUnit} />
          <p className={adminStyles.help}>Es la unidad en la que se calcula el costo. Después vas a poder cargar compras en kg, litros o paquetes.</p>
          {errors.baseUnit && <p className={adminStyles.error}>{errors.baseUnit}</p>}
        </fieldset>
      </section>

      <div className={`${adminStyles.actions} ${adminStyles.stickyActions}`}>
        <Button type="submit" disabled={saving}>
          {saving ? "Creando…" : "Crear ingrediente"}
        </Button>
        {message && (
          <p className={adminStyles.statusError} role="alert">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
