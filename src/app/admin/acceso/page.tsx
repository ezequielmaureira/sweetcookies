import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminGate } from "@/components/admin/AdminGate";
import { brandImages } from "@/data/cookies";
import { ADMIN_GATE_COOKIE, safeAdminNext } from "@/lib/admin/gate";
import { getHeroCookie } from "@/lib/hero-cookie";
import { resolveImage } from "@/lib/images";

/**
 * Pantalla previa al dashboard (solo la ven admins: el layout de /admin ya
 * verificó sesión + ADMIN_EMAILS). Si ya se comió la cookie en esta sesión
 * del navegador, sigue de largo.
 */
export default async function AdminGatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAdminNext((await searchParams).next);
  if ((await cookies()).get(ADMIN_GATE_COOKIE)?.value === "1") redirect(next);

  const cookie = getHeroCookie();
  return <AdminGate next={next} logoSrc={resolveImage(brandImages.logo)} cookie={cookie} />;
}
