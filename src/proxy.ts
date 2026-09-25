import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Proxy (ex middleware en Next 16) de Clerk: solo prepara la sesión en el
 * panel y el login. La web pública no pasa por Clerk.
 *
 * Siguiendo la recomendación actual de Clerk, la protección NO se hace por
 * coincidencia de rutas acá: se verifica en el recurso mismo
 * (src/app/admin/layout.tsx → getAdminAccess) y en la API de Fly.
 */
export default clerkMiddleware();

export const config = {
  matcher: ["/admin", "/admin/:path*", "/sign-in", "/sign-in/:path*"],
};
