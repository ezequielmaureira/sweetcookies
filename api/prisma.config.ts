import { defineConfig } from "prisma/config";

/**
 * Las migraciones usan la conexión DIRECTA (sin pooler) de Neon.
 * La app en runtime usa DATABASE_URL (con pooler) a través del adapter pg.
 * No se carga ningún .env automáticamente: pasá las variables explícitamente
 * (ver README.md).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
