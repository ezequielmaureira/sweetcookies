import { createClerkClient } from "@clerk/backend";

export type AuthResult = { userId: string } | null;

export type AuthService = {
  /** Verifica el token de sesión de Clerk (Authorization: Bearer ...). null si no es válido. */
  authenticate(request: Request): Promise<AuthResult>;
  /** Autorización server-side: publicMetadata.role === "admin" en Clerk. */
  isAdmin(userId: string): Promise<boolean>;
};

export const ADMIN_ROLE = "admin";

/** Lee el rol desde publicMetadata (solo modificable desde el backend / Dashboard de Clerk). */
export function hasAdminRole(publicMetadata: unknown): boolean {
  return (
    typeof publicMetadata === "object" &&
    publicMetadata !== null &&
    (publicMetadata as Record<string, unknown>).role === ADMIN_ROLE
  );
}

const ROLE_CACHE_MS = 30_000;

/**
 * Implementación con el SDK oficial de Clerk (@clerk/backend):
 * - authenticateRequest valida firma, expiración y authorizedParties (azp).
 * - El rol se consulta a la Backend API de Clerk (fuente de verdad), con un
 *   caché corto en memoria para no consultar en cada request.
 */
export function createClerkAuth(options: {
  secretKey: string;
  publishableKey: string;
  authorizedParties: string[];
}): AuthService {
  const clerk = createClerkClient({ secretKey: options.secretKey, publishableKey: options.publishableKey });
  const roleCache = new Map<string, { admin: boolean; expires: number }>();

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
      const cached = roleCache.get(userId);
      if (cached && cached.expires > Date.now()) return cached.admin;
      const user = await clerk.users.getUser(userId);
      const admin = hasAdminRole(user.publicMetadata);
      roleCache.set(userId, { admin, expires: Date.now() + ROLE_CACHE_MS });
      return admin;
    },
  };
}
