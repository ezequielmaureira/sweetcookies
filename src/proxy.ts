import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { getPublicSettings } from "@/lib/site-settings";

/**
 * Proxy (ex middleware en Next 16). Next solo permite uno: acá conviven, sin
 * tocarse entre sí, dos cosas separadas.
 *
 * 1) Clerk, exactamente como estaba: solo prepara la sesión en el panel, el
 *    login y la página del QR de vouchers (/v/*, para saber si quien escanea
 *    es admin y puede canjear). Siguiendo la recomendación actual de Clerk,
 *    la protección NO se hace por coincidencia de rutas acá: se verifica en
 *    el recurso mismo (src/app/admin/layout.tsx → getAdminAccess) y en la
 *    API de Fly. Estas rutas nunca pasan por la lógica de mantenimiento.
 *
 * 2) Modo mantenimiento: único punto de entrada de la web pública. Si está
 *    activo, reescribe a /mantenimiento sin alterar ninguna ruta ni
 *    componente público existente. El panel y el login quedan siempre afuera.
 */
const withClerk = clerkMiddleware();

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") || pathname.startsWith("/sign-in") || pathname.startsWith("/v/")) {
    return withClerk(request, event);
  }
  if (pathname === "/mantenimiento") return NextResponse.next();

  const settings = await getPublicSettings();
  if (!settings.maintenanceEnabled) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/mantenimiento";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)"],
};
