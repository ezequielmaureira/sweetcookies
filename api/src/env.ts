import { parseAdminEmails } from "./auth.ts";

/**
 * Variables de entorno del backend. Nunca se loguean sus valores.
 */
export type Env = {
  port: number;
  databaseUrl: string;
  clerkSecretKey: string;
  clerkPublishableKey: string;
  /** Orígenes permitidos para CORS de los endpoints admin (y authorizedParties de Clerk). */
  allowedOrigins: string[];
  /** ADMIN_EMAILS normalizado. Vacío = nadie es admin. */
  adminEmails: ReadonlySet<string>;
  /** Clave del HMAC de IP del campeonato (CHALLENGE_IP_SECRET). null = no se guarda ningún dato de IP. */
  challengeIpSecret: string | null;
  /** En Fly.io (FLY_APP_NAME) la IP sale de Fly-Client-IP; en local, de la conexión. */
  trustFlyProxy: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => /^https?:\/\/[^\s/]+$/.test(origin));
}

export function loadEnv(): Env {
  const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);
  if (allowedOrigins.length === 0) throw new Error("ALLOWED_ORIGINS debe tener al menos un origen válido.");
  return {
    port: Number(process.env.PORT) || 8080,
    databaseUrl: required("DATABASE_URL"),
    clerkSecretKey: required("CLERK_SECRET_KEY"),
    clerkPublishableKey: required("CLERK_PUBLISHABLE_KEY"),
    allowedOrigins,
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
    challengeIpSecret: (process.env.CHALLENGE_IP_SECRET?.trim().length ?? 0) >= 32 ? process.env.CHALLENGE_IP_SECRET!.trim() : null,
    trustFlyProxy: Boolean(process.env.FLY_APP_NAME),
  };
}
