/**
 * "Comete la cookie antes de entrar": paso de UX previo al dashboard.
 * NO es una medida de seguridad: el acceso real lo controlan Clerk +
 * ADMIN_EMAILS en el servidor (layout de /admin y API en Fly).
 */
export const ADMIN_GATE_COOKIE = "sc_admin_gate";
export const ADMIN_GATE_URL = "/admin/acceso";

/** Solo destinos internos del panel (evita redirecciones abiertas). */
export function safeAdminNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//") || next.startsWith(ADMIN_GATE_URL)) return "/admin";
  return next;
}
