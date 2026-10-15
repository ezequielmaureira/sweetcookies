"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage, uploadImage } from "@/lib/admin/admin-api";
import { ACCEPTED_IMAGE_TYPES, ImagePrepareError, prepareImage } from "@/lib/admin/image-resize";
import { getAdminSiteImages, saveAdminSiteImage, type SiteImageField } from "@/lib/admin/site-content-api";
import { resolveImageSrc } from "@/lib/catalog";
import styles from "./Admin.module.css";
import own from "./BoxImageForm.module.css";

const KEY = "BOX_IMAGE";
/** Lado mayor de la foto subida: nítida en pantallas grandes sin pesar de más. */
const MAX_SIDE = 1600;

type LoadState = "loading" | "ready" | "error";
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; text: string } | { kind: "error"; message: string };

type BoxImageFormProps = {
  /** Foto original del sitio (public/images/cookies/), o null si no existe. */
  defaultSrc: string | null;
};

/**
 * Foto del bloque “Armá tu box” del inicio. La foto elegida se ve antes de
 * guardar (sin subirla); recién al tocar “Guardar foto” se reduce, se sube con el
 * mismo sistema que las fotos de producto y queda guardada en la base.
 */
export function BoxImageForm({ defaultSrc }: BoxImageFormProps) {
  const { getToken, isLoaded } = useAuth();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [field, setField] = useState<SiteImageField | null>(null);
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { images } = await getAdminSiteImages(await getToken());
        if (cancelled) return;
        setField(images.find((i) => i.key === KEY) ?? null);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken]);

  // La vista previa local se libera al cambiarla o al salir.
  useEffect(() => () => {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
  }, [pending]);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setSave({ kind: "error", message: "Usá una foto JPG, PNG o WebP." });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setSave({ kind: "error", message: "La foto es demasiado pesada (máx. 25 MB)." });
      return;
    }
    setPending({ file, previewUrl: URL.createObjectURL(file) });
    setSave({ kind: "idle" });
  };

  const cancel = () => {
    setPending(null);
    setSave({ kind: "idle" });
  };

  const persist = async (url: string | null, text: string) => {
    const { images } = await saveAdminSiteImage(await getToken(), KEY, url);
    setField(images.find((i) => i.key === KEY) ?? null);
    setPending(null);
    setSave({ kind: "saved", text });
  };

  const handleSave = async () => {
    if (!pending || save.kind === "saving") return;
    setSave({ kind: "saving" });
    try {
      const blob = await prepareImage(pending.file, MAX_SIDE);
      const { url } = await uploadImage(await getToken(), blob);
      await persist(url, "Foto guardada. La web se actualiza en unos segundos.");
    } catch (error) {
      if (error instanceof ImagePrepareError) setSave({ kind: "error", message: error.message });
      else if (error instanceof AdminApiError && (error.status === 413 || error.status === 422)) setSave({ kind: "error", message: "No pudimos usar esa imagen. Probá con un JPG, PNG o WebP." });
      else setSave({ kind: "error", message: adminErrorMessage(error, "No pudimos guardar la foto.") });
    }
  };

  const handleReset = async () => {
    if (save.kind === "saving") return;
    setSave({ kind: "saving" });
    try {
      await persist(null, "Volvió la foto original. La web se actualiza en unos segundos.");
    } catch (error) {
      setSave({ kind: "error", message: adminErrorMessage(error, "No pudimos restaurar la foto original.") });
    }
  };

  const titleId = `${uid}-title`;

  if (loadState === "loading") {
    return (
      <p className={styles.status} role="status">
        Cargando foto…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <p className={styles.statusError} role="alert">
        No pudimos cargar la foto de “Armá tu box”. Probá recargar la página en unos segundos.
      </p>
    );
  }

  const saving = save.kind === "saving";
  const currentSrc = field?.url ? resolveImageSrc(field.url) : defaultSrc;
  const shownSrc = pending?.previewUrl ?? currentSrc;

  return (
    <section className={styles.section} aria-labelledby={titleId} aria-busy={saving}>
      <h2 id={titleId} className={styles.sectionTitle}>
        Foto de “Armá tu box”
      </h2>
      <p className={styles.sectionLead}>La foto del bloque “Armá tu box” del inicio.</p>

      <div className={own.previews}>
        <figure className={own.preview}>
          <div className={`${own.frame} ${own.mobile}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o foto de la API */}
            {shownSrc ? <img src={shownSrc} alt="" className={own.image} /> : <span className={own.empty}>Sin foto</span>}
          </div>
          <figcaption className={own.caption}>Celular</figcaption>
        </figure>
        <figure className={own.preview}>
          <div className={`${own.frame} ${own.desktop}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o foto de la API */}
            {shownSrc ? <img src={shownSrc} alt="" className={own.image} /> : <span className={own.empty}>Sin foto</span>}
          </div>
          <figcaption className={own.caption}>Computadora</figcaption>
        </figure>
      </div>

      <p className={styles.help}>
        {pending
          ? "Vista previa: todavía no se guardó. Tocá “Guardar foto” para publicarla o “Cancelar” para quedarte con la actual."
          : field?.url
            ? "Foto actual: la que subiste desde el panel."
            : "Foto actual: la original del sitio."}{" "}
        JPG, PNG o WebP. Se recorta al centro para llenar el recuadro; usá una foto horizontal con lo importante en el medio.
      </p>

      <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={handleFile} />

      <div className={styles.actions}>
        {pending ? (
          <>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar foto"}
            </Button>
            <Button variant="secondary" onClick={cancel} disabled={saving}>
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => fileRef.current?.click()} disabled={saving}>
              Elegir foto
            </Button>
            {field?.url && (
              <Button variant="ghost" onClick={handleReset} disabled={saving}>
                {saving ? "Restaurando…" : "Volver a la original"}
              </Button>
            )}
          </>
        )}
        <p className={save.kind === "error" ? styles.statusError : styles.status} role={save.kind === "error" ? "alert" : "status"}>
          {save.kind === "saved" && save.text}
          {save.kind === "error" && save.message}
        </p>
      </div>

      {field?.updatedAt && !pending && (
        <p className={styles.meta}>
          Última modificación: {new Date(field.updatedAt).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </section>
  );
}
