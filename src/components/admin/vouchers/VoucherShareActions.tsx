"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import buttonStyles from "@/components/ui/Button.module.css";
import { voucherMailtoUrl, voucherShareText, voucherUrl, voucherWhatsAppUrl, type AdminVoucher } from "@/lib/vouchers/voucher-format";
import styles from "./Vouchers.module.css";

/** Copia al portapapeles (con respaldo para navegadores sin Clipboard API). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * Compartir un voucher ACTIVO: siempre el LINK (/v/<publicId>), nunca una imagen.
 * Compartir (menú nativo; sin él, copia el link) · WhatsApp · Email (mailto) · Copiar link.
 * Solo admin: la vista del cliente (/v/...) no tiene estas acciones.
 */
const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary}`;

export function VoucherShareActions({ voucher }: { voucher: AdminVoucher }) {
  const url = voucherUrl(voucher.publicId);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const flash = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const copyLink = async () => flash((await copyText(url)) ? "Link copiado ✓" : `No se pudo copiar. Link: ${url}`);

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Voucher Sweet Cookies", text: voucherShareText(voucher, url) });
      } catch (error) {
        // El usuario cerró el menú de compartir: no es un error.
        if (!(error instanceof DOMException && error.name === "AbortError")) await copyLink();
      }
      return;
    }
    // Sin Web Share API (ej. escritorio): se ofrece el link copiado.
    flash((await copyText(url)) ? "Tu navegador no permite compartir: link copiado ✓" : `Link: ${url}`);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => void share()}>
        Compartir
      </Button>
      <a href={voucherWhatsAppUrl(voucher, url)} target="_blank" rel="noopener noreferrer" className={secondaryLink}>
        WhatsApp
      </a>
      <a href={voucherMailtoUrl(voucher, url)} className={secondaryLink}>
        Email
      </a>
      <Button variant="secondary" onClick={() => void copyLink()}>
        Copiar link
      </Button>
      <span className={styles.toast} role="status" aria-live="polite">
        {toast}
      </span>
    </>
  );
}
