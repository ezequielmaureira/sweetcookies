import fs from "node:fs";
import path from "node:path";

/**
 * Resolución de imágenes locales (solo servidor).
 *
 * Las fotos reales viven en /public/images/cookies/. Si un archivo todavía no
 * existe, devolvemos null y la UI muestra un placeholder neutro en lugar de
 * una imagen rota.
 */
export const COOKIE_IMAGES_DIR = "/images/cookies";

const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];
const publicDir = path.join(process.cwd(), "public");

export function resolveImage(baseName: string, dir = COOKIE_IMAGES_DIR): string | null {
  for (const ext of EXTENSIONS) {
    const publicPath = `${dir}/${baseName}${ext}`;
    if (fs.existsSync(path.join(publicDir, publicPath))) return publicPath;
  }
  return null;
}
