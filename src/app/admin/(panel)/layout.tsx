import { AdminShell } from "@/components/admin/AdminShell";

/** Dashboard y configuración (el acceso ya lo verificó src/app/admin/layout.tsx). */
export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
