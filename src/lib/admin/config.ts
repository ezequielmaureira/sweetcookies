/** Rutas del panel (sin secretos). */
export const ADMIN_SIGN_IN_URL = "/sign-in";
export const ADMIN_HOME_URL = "/admin";

/**
 * Allowlist de administradores (fuente autoritativa).
 * Formato: emails separados por coma. Se normaliza con trim + lowercase y se
 * ignoran entradas vacías. Vacía = nadie es admin.
 */
export function parseAdminEmails(raw: string | undefined | null): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

type ClerkEmail = { emailAddress: string; verification: { status: string } | null };

/**
 * true solo si alguno de los emails VERIFICADOS del usuario (según Clerk)
 * coincide exactamente con la allowlist. publicMetadata no se tiene en cuenta.
 */
export function isAllowedAdmin(emailAddresses: readonly ClerkEmail[], allowlist: ReadonlySet<string>): boolean {
  if (allowlist.size === 0) return false;
  return emailAddresses.some(
    (email) => email.verification?.status === "verified" && allowlist.has(email.emailAddress.trim().toLowerCase()),
  );
}
