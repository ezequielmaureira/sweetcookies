/**
 * Entrada al sitio: "Probala para entrar." (experiencia de UX, NO de seguridad).
 *
 * Se muestra una vez por sesión del navegador: al terminar la cookie se guarda
 * un flag en sessionStorage. Una sesión nueva vuelve a mostrarla.
 */
export const ENTRY_STORAGE_KEY = "sweetcookies:entered";

/** Atributo en <html> que oculta la entrada antes del primer render (sin parpadeo). */
export const ENTRY_ATTRIBUTE = "data-entered";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** sessionStorage puede no existir o lanzar (modo privado, cookies bloqueadas). */
export function hasEntered(storage: StorageLike | null | undefined): boolean {
  try {
    return storage?.getItem(ENTRY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markEntered(storage: StorageLike | null | undefined): void {
  try {
    storage?.setItem(ENTRY_STORAGE_KEY, "true");
  } catch {
    // Sin storage: la entrada vuelve a aparecer en la próxima carga completa.
  }
}

/** Script inline para <head>: marca <html> antes de pintar si ya se entró en esta sesión. */
export const entryScript = `try{if(sessionStorage.getItem(${JSON.stringify(ENTRY_STORAGE_KEY)})==="true")document.documentElement.setAttribute(${JSON.stringify(ENTRY_ATTRIBUTE)},"")}catch(e){}`;
