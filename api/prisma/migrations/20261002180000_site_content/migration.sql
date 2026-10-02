-- Textos públicos editables desde el panel. Tabla nueva: no modifica datos existentes.
-- Sin filas, la web sigue mostrando los textos originales (fallback en el código).
CREATE TABLE "site_content" (
    "id" VARCHAR(40) NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "value" VARCHAR(400) NOT NULL,
    "section" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" VARCHAR(64),

    CONSTRAINT "site_content_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_content_key_key" ON "site_content"("key");
