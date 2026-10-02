"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { voucherFont } from "@/components/vouchers/voucher-font";
import { type AdminVoucher } from "@/lib/vouchers/voucher-format";
import { renderVoucherPng, voucherImageFileName } from "@/lib/vouchers/voucher-render";
import styles from "./Vouchers.module.css";

/**
 * Lo que recibe el cliente es la IMAGEN del voucher (PNG final con QR y código),
 * nunca un link. Acciones (solo admin, voucher ACTIVO):
 * Ver imagen · Compartir imagen (menú del sistema con el archivo) ·
 * Guardar imagen (descarga) · WhatsApp / Compartir (mismo menú con el PNG:
 * el admin elige WhatsApp; desde el navegador no hay forma confiable de
 * adjuntar un archivo directo a WhatsApp).
 */
export function VoucherShareActions({ voucher }: { voucher: AdminVoucher }) {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  // La imagen se prepara antes del toque: el menú de compartir tiene que abrirse
  // en el mismo gesto (Safari lo bloquea si antes se espera a generar el PNG).
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const { publicId, code, cookieQuantity, expiresAt, description } = voucher;

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    renderVoucherPng({ publicId, code, cookieQuantity, expiresAt, description }, voucherFont.style.fontFamily)
      .then((blob) => {
        if (cancelled) return;
        const file = new File([blob], voucherImageFileName(code), { type: "image/png" });
        url = URL.createObjectURL(file);
        setImage({ file, url });
      })
      .catch((error: unknown) => {
        console.error("[voucher image] render failed", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [publicId, code, cookieQuantity, expiresAt, description]);

  const flash = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };

  const notReady = () => flash(failed ? "No pudimos generar la imagen. Recargá la página." : "Generando imagen…");

  const save = () => {
    if (!image) return notReady();
    const link = document.createElement("a");
    link.href = image.url;
    link.download = image.file.name;
    document.body.append(link);
    link.click();
    link.remove();
    flash("Imagen guardada ✓");
  };

  const view = () => {
    if (!image) return notReady();
    window.open(image.url, "_blank", "noopener");
  };

  /** Comparte SOLO el archivo PNG con el menú del sistema (WhatsApp, mail, etc.). */
  const share = async (target?: string) => {
    if (!image) return notReady();
    const data: ShareData = { files: [image.file], title: `Voucher Sweet Cookies ${code}` };
    if (typeof navigator.canShare === "function" && navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        // El usuario cerró el menú de compartir: no es un error.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    // El dispositivo no comparte archivos (ej. escritorio): se guarda el PNG para adjuntarlo a mano.
    save();
    flash(`Este dispositivo no permite compartir archivos: imagen guardada, adjuntala en ${target ?? "el chat o mail"}.`);
  };

  return (
    <>
      <Button onClick={() => void share()}>Compartir imagen</Button>
      <Button variant="secondary" onClick={save}>
        Guardar imagen
      </Button>
      <Button variant="secondary" onClick={() => void share("WhatsApp")}>
        WhatsApp / Compartir
      </Button>
      <Button variant="secondary" onClick={view}>
        Ver imagen
      </Button>
      <span className={styles.toast} role="status" aria-live="polite">
        {toast}
      </span>
    </>
  );
}
