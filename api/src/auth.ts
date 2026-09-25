import { createClerkClient } from "@clerk/backend";

export type AuthResult = { userId: string } | null;

export type AuthService = {
  /** Verifica el token de sesión de Clerk (Authorization: Bearer ...). null si no es válido. */
  authenticate(request: Request): Promise<AuthResult>;
  /** Autorización server-side: algún email verificado del usuario está en ADMIN_EMAILS. */
  isAdmin(userId: string): Promise<boolean>;
};

/** ADMIN_EMAILS → set normalizado (trim + lowercase, sin vacíos). Vacío = nadie es admin. */
export function parseAdminEmails(raw: string | undefined | null): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

type ClerkEmail = { emailAddress: string; verification: { status: string } | null };
type ClerkUserLike = { emailAddresses: readonly ClerkEmail[] };

/** Coincidencia exacta de un email VERIFICADO con la allowlist. publicMetadata no cuenta. */
export function isAllowedAdmin(user: ClerkUserLike, allowlist: ReadonlySet<string>): boolean {
  if (allowlist.size === 0) return false;
  return user.emailAddresses.some(
    (email) => email.verification?.status === "verified" && allowlist.has(email.emailAddress.trim().toLowerCase()),
  );
}

const ADMIN_CACHE_MS = 30_000;

/**
 * Implementación con el SDK oficial de Clerk (@clerk/backend):
 * - authenticateRequest valida firma, expiración y authorizedParties (azp).
 * - Los emails se leen del usuario real en la Backend API de Clerk (nunca
 *   del cliente), con un caché corto en memoria.
 */
export function createClerkAuth(options: {
  secretKey: string;
  publishableKey: string;
  authorizedParties: string[];
  adminEmails: ReadonlySet<string>;
  /** Solo para tests: reemplaza la consulta a Clerk. */
  getUser?: (userId: string) => Promise<ClerkUserLike>;
}): AuthService {
  const clerk = createClerkClient({ secretKey: options.secretKey, publishableKey: options.publishableKey });
  const getUser = options.getUser ?? ((userId: string) => clerk.users.getUser(userId));
  const cache = new Map<string, { admin: boolean; expires: number }>();

  return {
    async authenticate(request) {
      try {
        const state = await clerk.authenticateRequest(request, {
          authorizedParties: options.authorizedParties,
          acceptsToken: "session_token",
        });
        if (!state.isAuthenticated) return null;
        const { userId } = state.toAuth();
        return userId ? { userId } : null;
      } catch {
        return null;
      }
    },

    async isAdmin(userId) {
      const cached = cache.get(userId);
      if (cached && cached.expires > Date.now()) return cached.admin;
      const admin = isAllowedAdmin(await getUser(userId), options.adminEmails);
      cache.set(userId, { admin, expires: Date.now() + ADMIN_CACHE_MS });
      return admin;
    },
  };
}
