"use client";

import { createContext, useContext } from "react";
import { SITE_TEXT_DEFAULTS, type SiteTexts } from "@/lib/site-content";

const SiteTextsContext = createContext<SiteTexts>(SITE_TEXT_DEFAULTS);

/** Textos del sitio para los componentes del navegador (los lee el layout público en el servidor). */
export function SiteTextsProvider({ texts, children }: { texts: SiteTexts; children: React.ReactNode }) {
  return <SiteTextsContext.Provider value={texts}>{children}</SiteTextsContext.Provider>;
}

export const useSiteTexts = () => useContext(SiteTextsContext);
