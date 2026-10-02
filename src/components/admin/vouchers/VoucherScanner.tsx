"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/vouchers/ConfirmDialog";
import { AdminApiError, adminErrorMessage } from "@/lib/admin/admin-api";
import { getVoucher, getVoucherByCode, redeemVoucher } from "@/lib/admin/voucher-api";
import { VOUCHER_STATUS_LABELS, boxLabel, formatVoucherDate, formatVoucherDateTime, type AdminVoucher } from "@/lib/vouchers/voucher-format";
import { CAMERA_MESSAGES, CameraError, createQrReader, openRearCamera, type QrReader } from "@/lib/vouchers/qr-reader";
import { extractVoucherPublicId, normalizeVoucherCode } from "@/lib/vouchers/voucher-scan";
import styles from "./Scanner.module.css";

type Result =
  | { kind: "loading" }
  | { kind: "voucher"; voucher: AdminVoucher; redeemedNow: boolean; notice: string | null }
  | { kind: "not_found" }
  | { kind: "foreign" }
  | { kind: "error"; message: string };

type Camera = { state: "off" | "starting" | "on" } | { state: "error"; message: string };

/** Intervalo entre lecturas: suficiente para leer rápido sin recalentar el celular. */
const SCAN_INTERVAL_MS = 140;

/**
 * Escáner del admin: cámara → QR de Sweet Cookies → estado REAL del backend →
 * confirmar → canje atómico (endpoint existente). El código manual termina en
 * el mismo resultado. Nunca se navega a la URL escaneada.
 */
export function VoucherScanner() {
  const { getToken } = useAuth();
  const uid = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<QrReader | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  // Cada arranque/parada de la cámara invalida los anteriores (evita cámaras "huérfanas").
  const generationRef = useRef(0);
  // true desde que se detecta un QR hasta "Escanear otro": no se procesa ningún otro cuadro.
  const lockedRef = useRef(false);

  const [camera, setCamera] = useState<Camera>({ state: "off" });
  const [detected, setDetected] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const stopCamera = useCallback(() => {
    generationRef.current++;
    window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera((c) => (c.state === "error" ? c : { state: "off" }));
  }, []);

  /** Busca en el backend (por publicId del QR o por código manual) y muestra el resultado. */
  const lookup = useCallback(
    async (by: { publicId: string } | { code: string }) => {
      setResult({ kind: "loading" });
      try {
        const token = await getToken();
        const voucher = "publicId" in by ? await getVoucher(token, by.publicId) : await getVoucherByCode(token, by.code);
        setResult({ kind: "voucher", voucher, redeemedNow: false, notice: null });
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 404) setResult({ kind: "not_found" });
        else setResult({ kind: "error", message: adminErrorMessage(error, "No pudimos consultar el voucher.") });
      } finally {
        stopCamera();
        setDetected(false);
      }
    },
    [getToken, stopCamera],
  );

  const onDetected = useCallback(
    (text: string) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      window.clearTimeout(timerRef.current);
      // Feedback: se congela el cuadro con marco verde (y vibración si el celular la tiene).
      videoRef.current?.pause();
      setDetected(true);
      navigator.vibrate?.(80);
      const publicId = extractVoucherPublicId(text);
      if (!publicId) {
        stopCamera();
        setDetected(false);
        setResult({ kind: "foreign" });
        return;
      }
      void lookup({ publicId });
    },
    [lookup, stopCamera],
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    const generation = generationRef.current;
    lockedRef.current = false;
    setDetected(false);
    setCamera({ state: "starting" });
    try {
      const [stream, reader] = await Promise.all([openRearCamera(), readerRef.current ?? createQrReader()]);
      readerRef.current = reader;
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCamera({ state: "on" });

      const tick = async () => {
        if (generation !== generationRef.current || lockedRef.current) return;
        let text: string | null = null;
        try {
          text = await reader.read(video);
        } catch {
          text = null;
        }
        if (generation !== generationRef.current || lockedRef.current) return;
        if (text) onDetected(text);
        else timerRef.current = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      };
      void tick();
    } catch (error) {
      if (generation !== generationRef.current) return;
      setCamera({ state: "error", message: error instanceof CameraError ? CAMERA_MESSAGES[error.reason] : CAMERA_MESSAGES.unavailable });
    }
  }, [onDetected, stopCamera]);

  // La cámara se pide al entrar al escáner y se apaga al salir. Una sola vez:
  // si cambia la identidad de getToken no se reinicia la cámara a mitad de lectura.
  const startRef = useRef(startCamera);
  useEffect(() => {
    startRef.current = startCamera;
  }, [startCamera]);
  useEffect(() => {
    void startRef.current();
    return () => stopCamera();
  }, [stopCamera]);

  const scanAgain = () => {
    setResult(null);
    setConfirming(false);
    setManualCode("");
    void startCamera();
  };

  const searchManual = (event: React.FormEvent) => {
    event.preventDefault();
    lockedRef.current = true;
    stopCamera();
    const code = normalizeVoucherCode(manualCode);
    if (!code) {
      setResult({ kind: "not_found" });
      return;
    }
    void lookup({ code });
  };

  const redeem = async (voucher: AdminVoucher) => {
    setRedeeming(true);
    try {
      const response = await redeemVoucher(await getToken(), voucher.publicId);
      if (response.ok) {
        setResult({ kind: "voucher", voucher: response.voucher, redeemedNow: true, notice: null });
      } else if (response.voucher) {
        const status = VOUCHER_STATUS_LABELS[response.voucher.status].toLowerCase();
        setResult({ kind: "voucher", voucher: response.voucher, redeemedNow: false, notice: `No se canjeó: el voucher está ${status}.` });
      } else {
        setResult({ kind: "not_found" });
      }
    } catch (error) {
      setResult({ kind: "voucher", voucher, redeemedNow: false, notice: adminErrorMessage(error, "No pudimos canjear el voucher. Probá de nuevo.") });
    } finally {
      setRedeeming(false);
      setConfirming(false);
    }
  };

  const showCamera = result === null || result.kind === "loading";

  return (
    <div className={styles.scanner}>
      {showCamera && (
        <section className={styles.cameraBlock} aria-label="Cámara">
          <div className={`${styles.viewport} ${detected ? styles.viewportDetected : ""}`}>
            <video ref={videoRef} className={styles.video} playsInline muted aria-hidden="true" />
            <span className={styles.frame} aria-hidden="true" />
            {camera.state === "starting" && <p className={styles.overlay}>Activando cámara…</p>}
            {camera.state === "off" && !detected && result === null && <p className={styles.overlay}>Cámara apagada</p>}
            {camera.state === "error" && <p className={styles.overlay}>{camera.message}</p>}
            {detected && <p className={`${styles.overlay} ${styles.overlayOk}`}>QR detectado ✓ Buscando voucher…</p>}
            {result?.kind === "loading" && !detected && <p className={styles.overlay}>Buscando voucher…</p>}
          </div>
          <p className={styles.live} aria-live="polite">
            {camera.state === "on" && !detected ? "Apuntá la cámara al QR del voucher." : ""}
          </p>
          <div className={styles.cameraActions}>
            {camera.state === "on" || camera.state === "starting" ? (
              <Button variant="secondary" onClick={stopCamera}>
                Detener cámara
              </Button>
            ) : (
              result === null && <Button onClick={() => void startCamera()}>Activar cámara</Button>
            )}
          </div>
        </section>
      )}

      {result && result.kind !== "loading" && (
        <ScanResult
          result={result}
          onRedeem={() => setConfirming(true)}
          onScanAgain={scanAgain}
        />
      )}

      {result?.kind === "voucher" && (
        <ConfirmDialog
          open={confirming}
          title="Confirmar canje"
          confirmLabel="Confirmar canje"
          busy={redeeming}
          onConfirm={() => void redeem(result.voucher)}
          onCancel={() => !redeeming && setConfirming(false)}
        >
          <p className={styles.confirmBox}>
            {boxLabel(result.voucher.cookieQuantity)}
            <strong>{result.voucher.code}</strong>
          </p>
          <p>¿Querés marcar este voucher como utilizado?</p>
        </ConfirmDialog>
      )}

      <section className={styles.manual} aria-labelledby={`${uid}-manual`}>
        <h2 id={`${uid}-manual`} className={styles.manualTitle}>
          ¿No podés escanear el QR?
        </h2>
        {manualOpen ? (
          <form className={styles.manualForm} onSubmit={searchManual}>
            <label htmlFor={`${uid}-code`} className={styles.manualLabel}>
              Código del voucher
            </label>
            <div className={styles.manualRow}>
              <input
                id={`${uid}-code`}
                className={styles.manualInput}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="SC-______"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                required
              />
              <Button type="submit" disabled={!manualCode.trim() || result?.kind === "loading"}>
                Buscar
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setManualOpen(true)}>
            Ingresar código manualmente
          </Button>
        )}
      </section>
    </div>
  );
}

type ResultProps = {
  result: Exclude<Result, { kind: "loading" }>;
  onRedeem: () => void;
  onScanAgain: () => void;
};

/** Mismo resultado para QR y código manual. */
function ScanResult({ result, onRedeem, onScanAgain }: ResultProps) {
  const again = (
    <Button variant={result.kind === "voucher" && result.voucher.status === "ACTIVE" ? "secondary" : "primary"} className={styles.bigButton} onClick={onScanAgain}>
      Escanear otro
    </Button>
  );

  if (result.kind !== "voucher") {
    const title = result.kind === "foreign" ? "Este QR no pertenece a Sweet Cookies." : result.kind === "not_found" ? "Voucher no válido" : "No pudimos consultar el voucher";
    return (
      <article className={`${styles.result} ${styles.bad}`} aria-live="assertive">
        <span className={styles.icon} aria-hidden="true">
          ⛔
        </span>
        <h2 className={`${styles.resultTitle} ${result.kind === "not_found" ? "" : styles.sentence}`}>{title}</h2>
        {result.kind === "error" && <p className={styles.notice}>{result.message}</p>}
        <div className={styles.resultActions}>{again}</div>
      </article>
    );
  }

  const { voucher, redeemedNow, notice } = result;
  const ok = voucher.status === "ACTIVE" || redeemedNow;
  const titles: Record<AdminVoucher["status"], string> = {
    ACTIVE: "Voucher válido",
    REDEEMED: redeemedNow ? "Voucher canjeado" : "Voucher ya canjeado",
    EXPIRED: "Voucher vencido",
    CANCELLED: "Voucher anulado",
  };

  return (
    <article className={`${styles.result} ${ok ? styles.good : styles.bad}`} aria-live="assertive">
      <span className={styles.icon} aria-hidden="true">
        {ok ? "✓" : "⛔"}
      </span>
      <h2 className={styles.resultTitle}>{titles[voucher.status]}</h2>
      {voucher.status !== "CANCELLED" && <p className={styles.box}>{boxLabel(voucher.cookieQuantity)}</p>}
      <dl className={styles.facts}>
        <div>
          <dt>Código</dt>
          <dd className={styles.code}>{voucher.code}</dd>
        </div>
        {(voucher.status === "ACTIVE" || voucher.status === "EXPIRED") && (
          <div>
            <dt>Válido hasta</dt>
            <dd>{formatVoucherDate(voucher.expiresAt)}</dd>
          </div>
        )}
        {voucher.status === "REDEEMED" && voucher.redeemedAt && (
          <div>
            <dt>Canjeado</dt>
            <dd>{formatVoucherDateTime(voucher.redeemedAt)}</dd>
          </div>
        )}
      </dl>
      {notice && (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}
      <div className={styles.resultActions}>
        {voucher.status === "ACTIVE" && (
          <Button className={styles.bigButton} onClick={onRedeem}>
            Canjear voucher
          </Button>
        )}
        {again}
      </div>
    </article>
  );
}
