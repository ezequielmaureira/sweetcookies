import { adminRequest } from "@/lib/admin/admin-api";

export type SiteTextField = {
  key: string;
  /** Nombre visible (ej. "Título principal"). La clave nunca se muestra. */
  label: string;
  description: string | null;
  multiline: boolean;
  maxLength: number;
  /** Texto original de la web. */
  defaultValue: string;
  /** null = se muestra el original. */
  value: string | null;
};

export type SiteTextSection = { id: string; label: string; description: string; fields: SiteTextField[] };

export type AdminSiteTexts = { updatedAt: string | null; sections: SiteTextSection[] };

export const getAdminSiteTexts = (token: string | null) => adminRequest<AdminSiteTexts>("/api/admin/content", token);

/** Guarda todos los textos juntos. Vacío o igual al original = vuelve el original. */
export const saveAdminSiteTexts = (token: string | null, texts: Record<string, string>) =>
  adminRequest<AdminSiteTexts>("/api/admin/content", token, { method: "PUT", body: JSON.stringify({ texts }) });
