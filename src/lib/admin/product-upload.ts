import { AdminApiError, adminErrorMessage, uploadImage } from "@/lib/admin/admin-api";
import { ImagePrepareError, prepareImage } from "@/lib/admin/image-resize";

/** Qué imagen se sube: la principal (catálogo) o la específica para caja. */
export type UploadKind = "main" | "box";

/** Reduce la foto en el navegador (principal ≤ 1600 px, caja ≤ 900 px) y la sube. */
export async function uploadProductImage(
  getToken: () => Promise<string | null>,
  file: File,
  kind: UploadKind,
): Promise<{ url: string } | { error: string }> {
  try {
    const blob = await prepareImage(file, kind === "main" ? 1600 : 900);
    const { url } = await uploadImage(await getToken(), blob);
    return { url };
  } catch (error) {
    if (error instanceof ImagePrepareError) return { error: error.message };
    if (error instanceof AdminApiError && (error.status === 413 || error.status === 422)) return { error: "No pudimos usar esa imagen. Probá con un JPG, PNG o WebP." };
    return { error: adminErrorMessage(error, "No pudimos subir la imagen.") };
  }
}
