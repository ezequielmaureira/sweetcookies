import { redirect } from "next/navigation";

/** El alta de ingredientes se hace en la planilla. */
export default function NuevoIngredientePage() {
  redirect("/admin/gestion/ingredientes?nuevo=1");
}
