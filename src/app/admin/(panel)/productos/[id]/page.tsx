import { ProductForm } from "@/components/admin/products/ProductForm";

/** Edición completa: /admin/productos/nuevo (crear) o /admin/productos/<id> (editar). */
export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductForm productId={id === "nuevo" ? null : decodeURIComponent(id)} />;
}
