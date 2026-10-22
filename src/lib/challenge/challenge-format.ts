/**
 * Textos y fechas del campeonato (lógica pura). Las fechas se muestran siempre
 * en hora de Córdoba, sin importar la zona del teléfono.
 */
export const CHALLENGE_TIME_ZONE = "America/Argentina/Cordoba";

const pad = (n: number) => String(n).padStart(2, "0");

/** 2 d 04 h 12 min · o 04:12:33 si falta menos de un día. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days} d ${pad(hours)} h ${pad(minutes)} min`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const dateTime = new Intl.DateTimeFormat("es-AR", {
  timeZone: CHALLENGE_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "viernes 24/10, 23:59" (hora de Córdoba). */
export const formatCordobaDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(/\s+/g, " ");

/** Intentos oficiales del torneo (los define el admin; no se renuevan cada día). */
export const attemptsText = (left: number, limit: number) =>
  left === 1 ? `Te queda 1 de ${limit} intentos en este torneo` : `Te quedan ${left} de ${limit} intentos en este torneo`;

/* ---------- Invitaciones ---------- */

export type ShareKind = "invite" | "record" | "finished";

/** Enlace del torneo; con el código personal si lo hay. */
export function challengeLink(origin: string, tournamentId: string | null, ref: string | null): string {
  const url = new URL("/campeonato", origin);
  if (tournamentId) url.searchParams.set("torneo", tournamentId);
  if (ref) url.searchParams.set("ref", ref);
  return url.toString();
}

/**
 * Mensaje para invitar amigos. Usa el nombre y el premio reales del torneo y el
 * puntaje que validó el servidor (nunca uno inventado). En un torneo de prueba
 * no presenta el premio como real.
 */
export function shareMessage(input: { kind: ShareKind; tournamentName: string; prize: string; isTest: boolean; score: number | null; url: string }): string {
  const prizeLine = input.isTest ? "🧪 Es un torneo de prueba: no hay premio real." : `🏆 Premio: ${input.prize}`;
  if (input.kind === "finished") {
    return [
      "🏆 ¡Mirá cómo terminó Sweet Click Challenge!",
      "",
      `Desafío: ${input.tournamentName}${input.isTest ? " (torneo de prueba)" : ""}`,
      "",
      "Conocé los resultados y el próximo desafío de Sweet Cookies.",
      "",
      `👉 ${input.url}`,
    ].join("\n");
  }
  if (input.kind === "record" && input.score !== null) {
    return [
      "🍪 ¡Te desafío a superar mi récord!",
      "",
      `Conseguí ${input.score} ${input.score === 1 ? "mordida" : "mordidas"} en Sweet Click Challenge.`,
      "",
      prizeLine,
      "",
      "¿Podés superarme en 15 segundos?",
      "",
      `👉 ${input.url}`,
    ].join("\n");
  }
  return [
    "🍪 ¡Te desafío a participar en Sweet Click Challenge!",
    "",
    prizeLine,
    "",
    "Tenés 15 segundos para conseguir la mayor cantidad de mordidas.",
    "",
    "¿Te animás?",
    "",
    `👉 ${input.url}`,
  ].join("\n");
}

/** Parámetros de un enlace /campeonato?torneo=…&ref=… (validados: no se confía en la URL). */
export function readLinkParams(search: string): { tournamentId: string | null; ref: string | null } {
  const params = new URLSearchParams(search);
  const tournamentId = params.get("torneo");
  const ref = params.get("ref");
  return {
    tournamentId: tournamentId && /^[A-Za-z0-9_-]{1,40}$/.test(tournamentId) ? tournamentId : null,
    ref: ref && /^[a-z2-9]{10}$/.test(ref) ? ref : null,
  };
}

/** Abre WhatsApp (app o web) con el mensaje listo; la persona elige a quién mandarlo. */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** URL del perfil a partir del @ configurado ("@sweet.cookies.rio4"). */
export const instagramUrl = (handle: string) => `https://www.instagram.com/${encodeURIComponent(handle.replace(/^@/, ""))}/`;

export const bitesText = (n: number) => (n === 1 ? "1 mordida" : `${n} mordidas`);
export const cookiesText = (n: number) => (n === 1 ? "1 cookie" : `${n} cookies`);

/* ---------- Contacto con el ganador (panel) ---------- */

/** Primer nombre de "Nombre Apellido" (para el saludo). */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? "";

/** Mensaje preparado para el ganador. Lo envía el admin a mano: nunca se manda solo. */
export function winnerMessage(input: { name: string; tournamentName: string; prize: string }): string {
  return [
    `¡Hola, ${firstName(input.name)}! 🍪🏆`,
    "",
    `Te contactamos desde Sweet Cookies porque resultaste ganador del torneo ${input.tournamentName}.`,
    "",
    `Tu premio es: ${input.prize}.`,
    "",
    "Queremos coordinar con vos la verificación de tus datos y la entrega.",
    "",
    "¡Felicitaciones!",
  ].join("\n");
}

/** Abre el chat de WhatsApp con ESE número (solo dígitos, formato internacional) y el mensaje listo. */
export const whatsappChatUrl = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
