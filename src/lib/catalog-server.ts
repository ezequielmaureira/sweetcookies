import { apiUrl, fetchWithTimeout } from "@/lib/api";
import { PUBLIC_PRODUCTS_PATH, parseCatalog, type Product } from "@/lib/catalog";

export type CatalogResult = { status: "ok"; products: Product[] } | { status: "error"; products: Product[] };

/** Revalidación de las páginas públicas: los cambios del admin llegan en segundos, sin redeploy. */
export const CATALOG_REVALIDATE_SECONDS = 15;

/**
 * Catálogo del comprador desde el servidor (Server Components). No hay datos
 * de respaldo inventados: si la API no responde, la web muestra un aviso.
 * La disponibilidad real se vuelve a verificar al confirmar el pedido.
 */
export async function getPublicCatalog(): Promise<CatalogResult> {
  const url = apiUrl(PUBLIC_PRODUCTS_PATH);
  if (!url) return { status: "error", products: [] };
  try {
    const res = await fetchWithTimeout(url, { next: { revalidate: CATALOG_REVALIDATE_SECONDS }, timeoutMs: 8000 });
    if (!res.ok) return { status: "error", products: [] };
    const products = parseCatalog(await res.json());
    return products ? { status: "ok", products } : { status: "error", products: [] };
  } catch {
    return { status: "error", products: [] };
  }
}
