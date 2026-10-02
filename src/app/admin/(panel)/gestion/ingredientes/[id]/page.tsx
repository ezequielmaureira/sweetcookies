import { notFound, redirect } from "next/navigation";

/** Ya no hay ficha por ingrediente: se abre su fila en la planilla (con "+ Precio"). */
export default async function IngredientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/.test(id)) notFound();
  redirect(`/admin/gestion/ingredientes?abrir=${id}`);
}
