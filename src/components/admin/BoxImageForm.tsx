"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AdminApiError, adminErrorMessage, uploadImage } from "@/lib/admin/admin-api";
import { ACCEPTED_IMAGE_TYPES, ImagePrepareError, prepareImage } from "@/lib/admin/image-resize";
import { getAdminSiteImages, saveAdminSiteImage, type SiteImageField } from "@/lib/admin/site-content-api";
import { resolveImageSrc } from "@/lib/catalog";
import { IMAGE_FRAMING_LIMITS as L, imageFramingTransform, type ImageFraming, type ResponsiveFraming } from "@/lib/site-content";
import styles from "./Admin.module.css";
import own from "./BoxImageForm.module.css";

const KEY = "BOX_IMAGE";
/** Lado mayor de la foto subida: nítida en pantallas grandes sin pesar de más. */
const MAX_SIDE = 1600;
/** Proporción del recuadro en la web (BuildBoxSection: 5:4 en celular y en computadora). */
const FRAME_RATIO = 5 / 4;

type Device = "mobile" | "desktop";
const DEVICES: Record<Device, { label: string; help: string }> = {
  mobile: { label: "Celular", help: "Celulares y tablets." },
  desktop: { label: "Computadora", help: "Pantallas de 1024 px o más." },
};

type LoadState = "loading" | "ready" | "error";
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; text: string } | { kind: "error"; message: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const normalize = (f: ImageFraming): ImageFraming => ({
  scale: round(clamp(f.scale, L.minScale, L.maxScale), 2),
  x: round(clamp(f.x, L.minPosition, L.maxPosition)),
  y: round(clamp(f.y, L.minPosition, L.maxPosition)),
});
const sameFraming = (a: ResponsiveFraming | null, b: ResponsiveFraming | null) =>
  Boolean(a && b) && (["mobile", "desktop"] as const).every((d) => a![d].scale === b![d].scale && a![d].x === b![d].x && a![d].y === b![d].y);

/** Tamaño con el que la foto ENTERA llena justo el recuadro (como se ve sin encuadre propio). */
const fillScale = (naturalRatio: number) => round(clamp(Math.max(FRAME_RATIO / naturalRatio, naturalRatio / FRAME_RATIO), L.minScale, L.maxScale), 2);

type BoxImageFormProps = {
  /** Foto original del sitio (public/images/cookies/), o null si no existe. */
  defaultSrc: string | null;
};

/**
 * Foto del bloque “Armá tu box” del inicio, con editor de encuadre.
 *
 * El recuadro y la foto son independientes: la foto se dibuja ENTERA (sin
 * deformarse) y se achica (hasta 20 %), se agranda (hasta 300 %) y se mueve
 * libremente; lo que no cubre muestra el fondo beige del sitio.
 * - Arrastrar con mouse o dedo mueve la foto; pellizcar con dos dedos cambia el tamaño.
 * - Encuadre propio para celular/tablet y para computadora.
 * - La vista previa usa exactamente la misma transformación que la web.
 * - Nada se sube hasta tocar “Guardar”: cancelar deja todo como estaba.
 */
export function BoxImageForm({ defaultSrc }: BoxImageFormProps) {
  const { getToken, isLoaded } = useAuth();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [field, setField] = useState<SiteImageField | null>(null);
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);
  /** Encuadre en edición (null hasta conocer la proporción de la foto, si nunca se encuadró). */
  const [framing, setFraming] = useState<ResponsiveFraming | null>(null);
  /** Encuadre con el que se compara para saber si hay cambios (el guardado, o "llenar" si no había). */
  const [baseline, setBaseline] = useState<ResponsiveFraming | null>(null);
  /** Proporción (ancho/alto) de la foto que se está mostrando. */
  const [ratio, setRatio] = useState<number | null>(null);
  const [device, setDevice] = useState<Device>("mobile");
  /** Cambia al cancelar o restaurar: vuelve a montar la foto para leer su proporción otra vez. */
  const [photoVersion, setPhotoVersion] = useState(0);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const applySaved = (saved: SiteImageField | null) => {
    setField(saved);
    setFraming(saved?.framing ?? null);
    setBaseline(saved?.framing ?? null);
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

  /** Encuadre que "llena" el recuadro: igual a cómo se ve la foto sin encuadre propio. */
  const filled = (r: number): ResponsiveFraming => {
    const f = { scale: fillScale(r), x: 50, y: 50 };
    return { mobile: f, desktop: f };
  };

  // Al conocer la proporción: si no hay encuadre (foto nueva o nunca encuadrada), arranca llenando.
  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const r = img.naturalWidth / img.naturalHeight;
    setRatio(r);
    setFraming((prev) => prev ?? filled(r));
    setBaseline((prev) => prev ?? (pending ? null : filled(r)));
  };

  const setActive = (next: ImageFraming) => {
    setFraming((prev) => (prev ? { ...prev, [device]: normalize(next) } : prev));
    touch();
  };

  /* ---------- Arrastrar (1 dedo / mouse) y pellizcar (2 dedos) ---------- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: ImageFraming; points: { x: number; y: number }[]; width: number; height: number } | null>(null);

  const beginGesture = (el: HTMLElement) => {
    const current = framing?.[device];
    if (!current) return;
    const rect = el.getBoundingClientRect();
    gesture.current = { start: current, points: [...pointers.current.values()].slice(0, 2), width: rect.width, height: rect.height };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!framing || saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginGesture(event.currentTarget);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g) return;
    const now = [...pointers.current.values()].slice(0, 2);
    const mid = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
    const a = mid(g.points);
    const b = mid(now);
    // Mover: el desplazamiento en píxeles, en % del recuadro (la foto se mueve con el dedo).
    const next = { ...g.start, x: g.start.x + ((b.x - a.x) / g.width) * 100, y: g.start.y + ((b.y - a.y) / g.height) * 100 };
    // Pellizcar: la distancia entre los dos dedos cambia el tamaño.
    if (g.points.length === 2 && now.length === 2) {
      const dist = (pts: { x: number; y: number }[]) => Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const from = dist(g.points);
      if (from > 0) next.scale = g.start.scale * (dist(now) / from);
    }
    setActive(next);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    // Con los dedos que quedan, el gesto sigue desde el encuadre actual.
    if (pointers.current.size > 0) beginGesture(event.currentTarget);
    else gesture.current = null;
  };

  /* ---------- Archivo, guardar, cancelar ---------- */
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
    // Foto nueva: el encuadre se arma al cargarla (llenando el recuadro).
    setRatio(null);
    setFraming(null);
    setSave({ kind: "idle" });
  };

  const cancel = () => {
    setPending(null);
    setRatio(null);
    setFraming(field?.framing ?? null);
    setBaseline(field?.framing ?? null);
    setPhotoVersion((v) => v + 1);
    setSave({ kind: "idle" });
  };

  const persist = async (url: string | null, next: ResponsiveFraming | null, text: string) => {
    const { images } = await saveAdminSiteImage(await getToken(), KEY, url, next);
    applySaved(images.find((i) => i.key === KEY) ?? null);
    setPending(null);
    setSave({ kind: "saved", text });
  };

  const handleSave = async () => {
    if (save.kind === "saving" || !framing) return;
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
      await persist(null, null, "Volvió la foto original. La web se actualiza en unos segundos.");
      setRatio(null);
      setPhotoVersion((v) => v + 1);
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
  const dirty = Boolean(pending) || (framing !== null && !sameFraming(framing, baseline));
  const active = framing?.[device] ?? null;
  const other: Device = device === "mobile" ? "desktop" : "mobile";
  const editable = Boolean(shownSrc && active) && !saving;
  const sliderId = (name: string) => `${uid}-${name}`;

  const photo = (d: Device) =>
    shownSrc ? (
      // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o foto de la API
      <img
        key={`${shownSrc}-${photoVersion}`}
        src={shownSrc}
        alt=""
        className={own.image}
        // Mismo dibujo que la web: foto entera (contain) + tamaño y posición del encuadre.
        style={framing ? { transform: imageFramingTransform(framing[d]) } : { objectFit: "cover" }}
        onLoad={d === "mobile" ? handleImageLoad : undefined}
        draggable={false}
      />
    ) : (
      <span className={own.empty}>Sin foto</span>
    );

  const preview = (d: Device) => {
    const isActive = d === device;
    return (
      <figure key={d} className={[own.preview, isActive ? own.previewActive : ""].join(" ")}>
        {isActive ? (
          <div
            className={[own.frame, own.drag].join(" ")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            aria-hidden="true"
          >
            {photo(d)}
          </div>
        ) : (
          <button type="button" className={own.frame} onClick={() => setDevice(d)} aria-label={`Editar el encuadre de ${DEVICES[d].label.toLowerCase()}`}>
            {photo(d)}
          </button>
        )}
        <figcaption className={own.caption}>
          {DEVICES[d].label}
          {isActive ? " · arrastrá o pellizcá" : " · tocá para editar"}
        </figcaption>
      </figure>
    );
  };

  const slider = (name: "scale" | "x" | "y", label: string, min: number, max: number, step: number, display: string) => (
    <div className={own.slider}>
      <label htmlFor={sliderId(name)} className={own.sliderLabel}>
        <span>{label}</span>
        <output htmlFor={sliderId(name)}>{display}</output>
      </label>
      <input
        id={sliderId(name)}
        type="range"
        min={min}
        max={max}
        step={step}
        value={name === "scale" ? Math.round((active?.scale ?? 1) * 100) : (active?.[name] ?? 50)}
        disabled={!editable}
        onChange={(e) => active && setActive({ ...active, [name]: name === "scale" ? Number(e.target.value) / 100 : Number(e.target.value) })}
      />
    </div>
  );

  return (
    <section className={styles.section} aria-labelledby={titleId} aria-busy={saving}>
      <h2 id={titleId} className={styles.sectionTitle}>
        Foto de “Armá tu box”
      </h2>
      <p className={styles.sectionLead}>
        La foto del bloque “Armá tu box” del inicio. Achicala, agrandala y movela como quieras: lo que no cubra se ve con el fondo de la web.
      </p>

      <div className={own.tabs} role="radiogroup" aria-label="Encuadre a editar">
        {(Object.keys(DEVICES) as Device[]).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={device === d} className={own.tab} onClick={() => setDevice(d)}>
            {DEVICES[d].label}
          </button>
        ))}
      </div>

      <div className={own.previews}>{(["mobile", "desktop"] as const).map(preview)}</div>

      <div className={own.zoomRow}>
        <button type="button" className={own.zoomButton} onClick={() => active && setActive({ ...active, scale: active.scale - 0.1 })} disabled={!editable || (active?.scale ?? 1) <= L.minScale} aria-label="Achicar">
          −
        </button>
        <span className={own.zoomValue} aria-live="polite">
          Tamaño {Math.round((active?.scale ?? 1) * 100)} %
        </span>
        <button type="button" className={own.zoomButton} onClick={() => active && setActive({ ...active, scale: active.scale + 0.1 })} disabled={!editable || (active?.scale ?? 1) >= L.maxScale} aria-label="Agrandar">
          +
        </button>
      </div>

      <div className={own.sliders}>
        {slider("scale", "Tamaño", L.minScale * 100, L.maxScale * 100, 1, `${Math.round((active?.scale ?? 1) * 100)} %`)}
        {slider("x", "Horizontal", L.minPosition, L.maxPosition, 0.5, `${Math.round(active?.x ?? 50)} %`)}
        {slider("y", "Vertical", L.minPosition, L.maxPosition, 0.5, `${Math.round(active?.y ?? 50)} %`)}
      </div>

      <div className={own.linkRow}>
        <button type="button" className={own.linkButton} onClick={() => active && setActive({ ...active, x: 50, y: 50 })} disabled={!editable}>
          Centrar
        </button>
        <button type="button" className={own.linkButton} onClick={() => active && setActive({ scale: 1, x: 50, y: 50 })} disabled={!editable}>
          Ver la foto entera
        </button>
        <button type="button" className={own.linkButton} onClick={() => ratio && setActive(filled(ratio)[device])} disabled={!editable || !ratio}>
          Restablecer (llenar el recuadro)
        </button>
        <button
          type="button"
          className={own.linkButton}
          onClick={() => {
            setFraming((prev) => (prev ? { ...prev, [other]: prev[device] } : prev));
            touch();
          }}
          disabled={!editable}
        >
          Usar este encuadre también en {DEVICES[other].label.toLowerCase()}
        </button>
      </div>

      <p className={styles.help}>
        {pending
          ? "Vista previa: todavía no se guardó. Tocá “Guardar” para publicarla o “Cancelar” para quedarte con la actual."
          : field?.url
            ? "Foto actual: la que subiste desde el panel."
            : "Foto actual: la original del sitio."}{" "}
        {DEVICES[device].help} JPG, PNG o WebP. La foto nunca se deforma.
      </p>

      <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={handleFile} />

      <div className={styles.actions}>
        <Button onClick={handleSave} disabled={!dirty || saving || !framing}>
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
        {(field?.url || field?.framing) && !dirty && (
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
