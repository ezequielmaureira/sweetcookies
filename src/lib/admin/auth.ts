import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasAdminRole } from "./config";

export type AdminAccess = { status: "anonymous" } | { status: "forbidden"; userId: string } | { status: "admin"; userId: string };

/**
 * Verificación centralizada server-side del acceso al panel.
 * El rol se lee de la Backend API de Clerk (no de datos del navegador).
 */
export async function getAdminAccess(): Promise<AdminAccess> {
  const { userId } = await auth();
  if (!userId) return { status: "anonymous" };
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return hasAdminRole(user.publicMetadata) ? { status: "admin", userId } : { status: "forbidden", userId };
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminAccess()).status === "admin";
}
