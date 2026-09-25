import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_GATE_COOKIE, ADMIN_GATE_URL } from "./gate";

/** Si el admin todavía no pasó por la cookie en esta sesión del navegador, lo manda a /admin/acceso. */
export async function requireAdminGate(currentPath: string) {
  const jar = await cookies();
  if (jar.get(ADMIN_GATE_COOKIE)?.value !== "1") {
    redirect(`${ADMIN_GATE_URL}?next=${encodeURIComponent(currentPath)}`);
  }
}
