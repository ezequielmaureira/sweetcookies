import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { AdminShell } from "@/components/admin/AdminShell";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { getAdminAccess } from "@/lib/admin/auth";
import { ADMIN_HOME_URL, ADMIN_SIGN_IN_URL } from "@/lib/admin/config";
import { clerkAppearance, clerkLocalization } from "@/lib/admin/clerk-appearance";

export const metadata: Metadata = {
  title: "Admin — Sweet Cookies",
  robots: { index: false, follow: false },
};

// Siempre se evalúa por request (sesión y autorización).
export const dynamic = "force-dynamic";

/**
 * Seguridad real del panel (server-side), para TODAS las rutas /admin/*:
 * sin sesión → login · sin permiso → acceso restringido · admin → contenido.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();
  if (access.status === "anonymous") redirect(`${ADMIN_SIGN_IN_URL}?redirect_url=${encodeURIComponent(ADMIN_HOME_URL)}`);

  return (
    <ClerkProvider appearance={clerkAppearance} localization={clerkLocalization} signInUrl={ADMIN_SIGN_IN_URL} afterSignOutUrl="/">
      {access.status === "admin" ? (
        children
      ) : (
        <AdminShell>
          <AccessDenied />
        </AdminShell>
      )}
    </ClerkProvider>
  );
}
