/**
 * Prepara una foto para subir (solo navegador): la reduce para que el lado
 * mayor no pase de `maxSide` y la re-codifica (WebP, o JPEG si el navegador no
 * sabe generar WebP). Así las imágenes pesan poco y el servidor las acepta
 * (máx. 1,5 MB).
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = 1_572_864;

export class ImagePrepareError extends Error {}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File, maxSide: number): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new ImagePrepareError("Usá una foto JPG, PNG o WebP.");
  if (file.size > 25 * 1024 * 1024) throw new ImagePrepareError("La foto es demasiado pesada (máx. 25 MB).");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePrepareError("No pudimos leer esa imagen.");
  }
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepareError("No pudimos procesar la imagen.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // JPEG no tiene transparencia: fondo crema del sitio (no negro) para PNG recortados.
  let opaque: HTMLCanvasElement | null = null;
  const opaqueCanvas = () => {
    if (opaque) return opaque;
    opaque = document.createElement("canvas");
    opaque.width = canvas.width;
    opaque.height = canvas.height;
    const octx = opaque.getContext("2d");
    if (octx) {
      octx.fillStyle = "#faf6ef";
      octx.fillRect(0, 0, opaque.width, opaque.height);
      octx.drawImage(canvas, 0, 0);
    }
    return opaque;
  };

  // WebP si el navegador lo soporta (si no, toBlob devuelve PNG): en ese caso, JPEG.
  for (const quality of [0.86, 0.75, 0.6]) {
    let blob = await encode(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await encode(opaqueCanvas(), "image/jpeg", quality);
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  throw new ImagePrepareError("La foto sigue siendo muy pesada. Probá con otra.");
}
