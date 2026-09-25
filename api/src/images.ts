/**
 * Imágenes subidas desde el panel (lógica pura): validación por contenido real
 * (magic bytes), no por lo que declara el navegador.
 */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** 1,5 MB: el panel reduce la foto antes de subir (lado mayor ≤ 1600 px). */
export const MAX_IMAGE_BYTES = 1_572_864;

/** Ruta pública (en la API) de una imagen subida; se guarda tal cual en imageUrl / boxImageUrl. */
export const imagePath = (id: string) => `/api/public/images/${id}`;

export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Ancho/alto leídos del archivo (PNG, JPEG y WebP). null si no se pudo leer. */
export function imageSize(bytes: Uint8Array, type: ImageType): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === "image/png") return { width: view.getUint32(16), height: view.getUint32(20) };
    if (type === "image/webp") {
      const chunk = String.fromCharCode(...bytes.subarray(12, 16));
      if (chunk === "VP8X") return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
      if (chunk === "VP8L") {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      return null;
    }
    // JPEG: recorrer segmentos hasta un SOF.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

export type ImageValidation =
  | { ok: true; type: ImageType; width: number | null; height: number | null }
  | { ok: false; error: "empty" | "too_large" | "unsupported_type" | "type_mismatch" | "too_big_dimensions" };

/** Valida el archivo subido: tipo permitido (por contenido), tamaño y dimensiones razonables. */
export function validateImage(bytes: Uint8Array, declaredType: string | undefined): ImageValidation {
  if (bytes.length === 0) return { ok: false, error: "empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "unsupported_type" };
  const declared = (declaredType ?? "").split(";")[0].trim().toLowerCase();
  if (declared && declared !== type) return { ok: false, error: "type_mismatch" };
  const size = imageSize(bytes, type);
  if (size && (size.width > 4000 || size.height > 4000 || size.width < 1 || size.height < 1)) return { ok: false, error: "too_big_dimensions" };
  return { ok: true, type, width: size?.width ?? null, height: size?.height ?? null };
}
