/** Rutas del panel (sin secretos). */
export const ADMIN_SIGN_IN_URL = "/sign-in";
export const ADMIN_HOME_URL = "/admin";
export const ADMIN_ROLE = "admin";

/** Rol guardado en Clerk → publicMetadata.role (solo editable desde el backend o el Dashboard). */
export function hasAdminRole(publicMetadata: unknown): boolean {
  return (
    typeof publicMetadata === "object" &&
    publicMetadata !== null &&
    (publicMetadata as Record<string, unknown>).role === ADMIN_ROLE
  );
}
