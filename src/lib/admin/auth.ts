import { auth, clerkClient } from "@clerk/nextjs/server";
import { isAllowedAdmin, parseAdminEmails } from "./config";

export type AdminAccess = { status: "anonymous" } | { status: "forbidden"; userId: string } | { status: "admin"; userId: string };

/**
 * Verificación centralizada server-side del acceso al panel:
 * 1) sesión de Clerk, 2) usuario real desde la Backend API de Clerk,
 * 3) emails verificados, 4) comparación exacta contra ADMIN_EMAILS.
 * ADMIN_EMAILS es solo server-side (nunca NEXT_PUBLIC_*).
 */
export async function getAdminAccess(): Promise<AdminAccess> {
  const { userId } = await auth();
  if (!userId) return { status: "anonymous" };
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS);
  return isAllowedAdmin(user.emailAddresses, allowlist) ? { status: "admin", userId } : { status: "forbidden", userId };
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminAccess()).status === "admin";
}
