-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "whatsapp_number" VARCHAR(15),
    "instagram_handle" VARCHAR(31),
    "whatsapp_orders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" VARCHAR(64),

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id"),
    -- Una sola configuración global.
    CONSTRAINT "site_settings_singleton" CHECK ("id" = 'global')
);


-- Registro singleton inicial. Solo datos reales ya publicados en el sitio:
-- Instagram @sweet.cookies.rio4. El número de WhatsApp queda vacío (se configura desde /admin).
INSERT INTO "site_settings" ("id", "whatsapp_number", "instagram_handle", "whatsapp_orders_enabled", "updated_at")
VALUES ('global', NULL, '@sweet.cookies.rio4', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
