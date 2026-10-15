"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";
import { FramingArea, FramingControls, type Framing } from "@/components/admin/products/FramingControls";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage, uploadImage } from "@/lib/admin/admin-api";
import { ACCEPTED_IMAGE_TYPES, ImagePrepareError, prepareImage } from "@/lib/admin/image-resize";
import { getAdminSiteImages, saveAdminSiteImage, type SiteImageField } from "@/lib/admin/site-content-api";
import { boxImageStyle } from "@/lib/box-view";
import { resolveImageSrc } from "@/lib/catalog";
import { DEFAULT_IMAGE_FRAMING, type ResponsiveFraming } from "@/lib/site-content";
import styles from "./Admin.module.css";
import own from "./BoxImageForm.module.css";

const KEY = "BOX_IMAGE";
/** Lado mayor de la foto subida: nítida en pantallas grandes sin pesar de más. */
const MAX_SIDE = 1600;
/** Zoom mínimo 100 %: la foto siempre cubre el recuadro (sin espacios vacíos ni deformación). */
const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Device = "mobile" | "desktop";
const DEVICES: Record<Device, { label: string; help: string }> = {
  mobile: { label: "Celular", help: "Celulares y tablets." },
  desktop: { label: "Computadora", help: "Pantallas de 1024 px o más." },
};

type LoadState = "loading" | "ready" | "error";
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; text: string } | { kind: "error"; message: string };

const CENTERED: ResponsiveFraming = { mobile: DEFAULT_IMAGE_FRAMING, desktop: DEFAULT_IMAGE_FRAMING };
const sameFraming = (a: ResponsiveFraming, b: ResponsiveFraming) =>
  (["mobile", "desktop"] as const).every((d) => a[d].scale === b[d].scale && a[d].x === b[d].x && a[d].y === b[d].y);
const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * 100) / 100));

type BoxImageFormProps = {
  /** Foto original del sitio (public/images/cookies/), o null si no existe. */
  defaultSrc: string | null;
};

/**
 * Foto del bloque “Armá tu box” del inicio, con editor de encuadre.
 *
 * - Se elige la foto (o se usa la actual) y se encuadra arrastrando y con zoom.
 * - Encuadre propio para celular/tablet y para computadora (los recuadros de la web
 *   son 5:4; cada uno puede recortar distinto).
 * - La vista previa usa exactamente el mismo cálculo que la web (object-position +
 *   zoom desde el punto elegido), así que se ve igual que en la tienda.
 * - Nada se sube hasta tocar “Guardar”: cancelar deja todo como estaba.
 */
export function BoxImageForm({ defaultSrc }: BoxImageFormProps) {
  const { getToken, isLoaded } = useAuth();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [field, setField] = useState<SiteImageField | null>(null);
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);
  const [framing, setFraming] = useState<ResponsiveFraming>(CENTERED);
  const [device, setDevice] = useState<Device>("mobile");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const applySaved = (saved: SiteImageField | null) => {
    setField(saved);
    setFraming(saved?.framing ?? CENTERED);
  };

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { images } = await getAdminSiteImages(await getToken());
        if (cancelled) return;
        applySaved(images.find((i) => i.key === KEY) ?? null);
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

  const touch = () => {
    if (save.kind !== "saving") setSave({ kind: "idle" });
  };

  const updateFraming = (patch: Partial<Framing>) => {
    setFraming((prev) => {
      const current = prev[device];
      const next = {
        scale: patch.scale !== undefined ? clampScale(patch.scale) : current.scale,
        x: patch.x ?? current.x,
        y: patch.y ?? current.y,
      };
      return { ...prev, [device]: next };
    });
    touch();
  };

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
    // Foto nueva: se empieza centrada.
    setFraming(CENTERED);
    setSave({ kind: "idle" });
  };

  const cancel = () => {
    setPending(null);
    setFraming(field?.framing ?? CENTERED);
    setSave({ kind: "idle" });
  };

  const persist = async (url: string | null, next: ResponsiveFraming, text: string) => {
    const { images } = await saveAdminSiteImage(await getToken(), KEY, url, next);
    applySaved(images.find((i) => i.key === KEY) ?? null);
    setPending(null);
    setSave({ kind: "saved", text });
  };

  const handleSave = async () => {
    if (save.kind === "saving") return;
    setSave({ kind: "saving" });
    try {
      let url = field?.url ?? null;
      if (pending) {
        const blob = await prepareImage(pending.file, MAX_SIDE);
        url = (await uploadImage(await getToken(), blob)).url;
      }
      await persist(url, framing, "Foto y encuadre guardados. La web se actualiza en unos segundos.");
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
      await persist(null, CENTERED, "Volvió la foto original, centrada. La web se actualiza en unos segundos.");
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
  const dirty = Boolean(pending) || !sameFraming(framing, field?.framing ?? CENTERED);
  const active = framing[device];
  const other: Device = device === "mobile" ? "desktop" : "mobile";

  const preview = (d: Device) => {
    const f = framing[d];
    const isActive = d === device;
    return (
      <figure key={d} className={[own.preview, own[d], isActive ? own.previewActive : ""].join(" ")}>
        {isActive ? (
          <FramingArea value={f} onChange={updateFraming} enabled={Boolean(shownSrc) && !saving} className={[own.frame, own.drag].join(" ")}>
            {shownSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o foto de la API
              <img src={shownSrc} alt="" className={own.image} style={boxImageStyle({ ...f, rotation: 0 })} draggable={false} />
            ) : (
              <span className={own.empty}>Sin foto</span>
            )}
          </FramingArea>
        ) : (
          <button type="button" className={own.frame} onClick={() => setDevice(d)} aria-label={`Editar el encuadre de ${DEVICES[d].label.toLowerCase()}`}>
            {shownSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o foto de la API
              <img src={shownSrc} alt="" className={own.image} style={boxImageStyle({ ...f, rotation: 0 })} draggable={false} />
            ) : (
              <span className={own.empty}>Sin foto</span>
            )}
          </button>
        )}
        <figcaption className={own.caption}>
          {DEVICES[d].label}
          {isActive ? " · arrastrá para encuadrar" : " · tocá para editar"}
        </figcaption>
      </figure>
    );
  };

  return (
    <section className={styles.section} aria-labelledby={titleId} aria-busy={saving}>
      <h2 id={titleId} className={styles.sectionTitle}>
        Foto de “Armá tu box”
      </h2>
      <p className={styles.sectionLead}>La foto del bloque “Armá tu box” del inicio. Elegila y encuadrala como querés que se vea.</p>

      <div className={own.tabs} role="radiogroup" aria-label="Encuadre a editar">
        {(Object.keys(DEVICES) as Device[]).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={device === d} className={own.tab} onClick={() => setDevice(d)}>
            {DEVICES[d].label}
          </button>
        ))}
      </div>

      <div className={own.previews}>{(["mobile", "desktop"] as const).map(preview)}</div>

      <div className={own.zoomRow}>
        <button type="button" className={own.zoomButton} onClick={() => updateFraming({ scale: active.scale - 0.1 })} disabled={!shownSrc || saving || active.scale <= MIN_SCALE} aria-label="Alejar">
          −
        </button>
        <span className={own.zoomValue} aria-live="polite">
          Zoom {Math.round(active.scale * 100)} %
        </span>
        <button type="button" className={own.zoomButton} onClick={() => updateFraming({ scale: active.scale + 0.1 })} disabled={!shownSrc || saving || active.scale >= MAX_SCALE} aria-label="Acercar">
          +
        </button>
      </div>

      <FramingControls value={active} onChange={updateFraming} disabled={!shownSrc || saving} minScale={MIN_SCALE} />

      <div className={own.linkRow}>
        <button type="button" className={own.linkButton} onClick={() => {
            setFraming((prev) => ({ ...prev, [other]: prev[device] }));
            touch();
          }} disabled={!shownSrc || saving}>
          Usar este encuadre también en {DEVICES[other].label.toLowerCase()}
        </button>
      </div>

      <p className={styles.help}>
        {pending
          ? "Vista previa: todavía no se guardó. Tocá “Guardar” para publicarla o “Cancelar” para quedarte con la actual."
          : field?.url
            ? "Foto actual: la que subiste desde el panel."
            : "Foto actual: la original del sitio."}{" "}
        {DEVICES[device].help} JPG, PNG o WebP. La foto nunca se deforma y siempre cubre todo el recuadro.
      </p>

      <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={handleFile} />

      <div className={styles.actions}>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        {dirty && (
          <Button variant="secondary" onClick={cancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={saving}>
          {shownSrc ? "Cambiar foto" : "Elegir foto"}
        </Button>
        {field?.url && !dirty && (
          <Button variant="ghost" onClick={handleReset} disabled={saving}>
            Volver a la original
          </Button>
        )}
        <p className={save.kind === "error" ? styles.statusError : styles.status} role={save.kind === "error" ? "alert" : "status"}>
          {save.kind === "saved" && save.text}
          {save.kind === "error" && save.message}
        </p>
      </div>

      {field?.updatedAt && !dirty && (
        <p className={styles.meta}>
          Última modificación: {new Date(field.updatedAt).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </section>
  );
}
