/**
 * Lector de QR desde la cámara (solo navegador).
 * - BarcodeDetector nativo cuando existe y soporta QR (Chrome/Android: rápido).
 * - Si no (Safari/iPhone, Firefox): jsQR sobre un cuadro reducido del video.
 */
import jsQR from "jsqr";

type NativeDetector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type NativeDetectorClass = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

export type QrReader = { read(video: HTMLVideoElement): Promise<string | null> };

/** Lado máximo del cuadro analizado por jsQR (más chico = más rápido en celulares). */
const MAX_SIDE = 720;

async function nativeReader(): Promise<QrReader | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? [];
    if (!formats.includes("qr_code")) return null;
    const detector = new Detector({ formats: ["qr_code"] });
    return {
      async read(video) {
        const codes = await detector.detect(video);
        return codes[0]?.rawValue ?? null;
      },
    };
  } catch {
    return null;
  }
}

function jsQrReader(): QrReader {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return {
    async read(video) {
      const { videoWidth: w, videoHeight: h } = video;
      if (!ctx || !w || !h) return null;
      const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
    },
  };
}

export async function createQrReader(): Promise<QrReader> {
  return (await nativeReader()) ?? jsQrReader();
}

/** Cámara trasera cuando existe (facingMode "environment"); si no, la que haya. */
export async function openRearCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new CameraError("denied");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new CameraError("not_found");
    throw new CameraError("unavailable");
  }
}

export class CameraError extends Error {
  readonly reason: "unsupported" | "denied" | "not_found" | "unavailable";
  constructor(reason: CameraError["reason"]) {
    super(reason);
    this.reason = reason;
  }
}

export const CAMERA_MESSAGES: Record<CameraError["reason"], string> = {
  unsupported: "Este navegador no permite usar la cámara (o la página no es segura: hace falta https). Usá el código manual.",
  denied: "No hay permiso para usar la cámara. Habilitalo en el navegador y tocá “Activar cámara”.",
  not_found: "No encontramos una cámara en este dispositivo. Usá el código manual.",
  unavailable: "La cámara está ocupada o no responde. Cerrá otras apps que la usen y tocá “Activar cámara”.",
};
