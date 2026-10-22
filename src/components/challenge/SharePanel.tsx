"use client";

import { useEffect, useState } from "react";
import { createInvite, type Tournament } from "@/lib/challenge/challenge-api";
import { challengeLink, shareMessage, whatsappShareUrl, type ShareKind } from "@/lib/challenge/challenge-format";
import shared from "./Challenge.module.css";
import styles from "./SharePanel.module.css";

type SharePanelProps = {
  tournament: Tournament;
  kind: ShareKind;
  /** Puntaje validado por el servidor (solo para "record"). */
  score: number | null;
  /** Sesión del jugador: con ella se usa su enlace personal. */
  token: string | null;
  title?: string;
  /** Destacado (después de jugar o con los intentos agotados). */
  prominent?: boolean;
};

/**
 * "🍪 Invitá a tus amigos": WhatsApp, compartir (Web Share API, si el celular la
 * tiene) y copiar la invitación. Solo difunde el torneo: no da intentos,
 * puntos ni ventajas. No se puede saber si alguien realmente envió el mensaje,
 * así que acá no se mide nada: se miden las visitas al enlace y los registros.
 */
export function SharePanel({ tournament, kind, score, token, title, prominent = false }: SharePanelProps) {
  const [ref, setRef] = useState<{ tournamentId: string; code: string } | null>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [canShare, setCanShare] = useState(false);

  // Enlace personal del jugador para ESTE torneo (si tiene sesión). Sin sesión, el enlace del torneo.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    createInvite(token, tournament.id)
      .then((invite) => alive && invite.tournamentId === tournament.id && setRef(invite))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [token, tournament.id]);

  // Web Share API: solo en el navegador y si existe (la mayoría de los celulares).
  useEffect(() => {
    const timer = window.setTimeout(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const url = () => challengeLink(window.location.origin, tournament.id, ref?.tournamentId === tournament.id ? ref.code : null);
  const message = () => shareMessage({ kind, tournamentName: tournament.name, prize: tournament.prize, isTest: tournament.isTest, score, url: url() });

  const copy = async () => {
    const text = message();
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // Navegadores sin portapapeles moderno.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      setCopied(ok ? "ok" : "failed");
    }
  };

  const share = async () => {
    if (!canShare) return void copy();
    try {
      await navigator.share({ title: `Sweet Click Challenge · ${tournament.name}`, text: message() });
    } catch (error) {
      // Cancelar el menú no es un error. Si el navegador no pudo compartir, se copia.
      if (!(error instanceof DOMException && error.name === "AbortError")) void copy();
    }
  };

  const heading = title ?? (kind === "finished" ? "Compartí el resultado" : "🍪 Invitá a tus amigos");

  return (
    <div className={`${styles.panel} ${prominent ? styles.prominent : ""}`}>
      <p className={styles.title}>{heading}</p>
      {kind !== "finished" && <p className={styles.lead}>Desafialos a superarte. Solo es para difundir: no suma intentos ni puntos.</p>}
      <div className={styles.buttons}>
        <a
          className={`${shared.cta} ${styles.whatsapp}`}
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            // El mensaje se arma al tocar (con el enlace personal ya cargado).
            event.currentTarget.href = whatsappShareUrl(message());
          }}
        >
          Compartir por WhatsApp
        </a>
        <button type="button" className={shared.ghost} onClick={() => void share()}>
          {canShare ? "Compartir desafío" : "Copiar enlace"}
        </button>
        <button type="button" className={shared.ghost} onClick={() => void copy()}>
          Copiar invitación
        </button>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {copied === "ok" ? "¡Invitación copiada! Pegala donde quieras." : copied === "failed" ? "No pudimos copiarla. Probá con WhatsApp o Compartir." : ""}
      </p>
      {canShare && <p className={styles.note}>“Compartir desafío” abre las apps de tu celular (según el teléfono, también Instagram).</p>}
    </div>
  );
}
