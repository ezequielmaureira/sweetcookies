import { adminRequest } from "@/lib/admin/admin-api";
import type { ResponsiveFraming } from "@/lib/site-content";

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

/* ---------- Fotos del sitio ---------- */

export type SiteImageField = {
  key: string;
  label: string;
  description: string;
  /** Ruta de la foto subida; null = se muestra la original del sitio. */
  url: string | null;
  /** Encuadre guardado; null = nunca se encuadró (la web la muestra llenando el recuadro). */
  framing: ResponsiveFraming | null;
  updatedAt: string | null;
};

export const getAdminSiteImages = (token: string | null) => adminRequest<{ images: SiteImageField[] }>("/api/admin/content/images", token);

/** Guarda la foto (ruta devuelta por uploadImage; null = la original) y su encuadre, juntos. */
export const saveAdminSiteImage = (token: string | null, key: string, url: string | null, framing: ResponsiveFraming | null) =>
  adminRequest<{ images: SiteImageField[] }>(`/api/admin/content/images/${encodeURIComponent(key)}`, token, { method: "PUT", body: JSON.stringify({ url, framing }) });
