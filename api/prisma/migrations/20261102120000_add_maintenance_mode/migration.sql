-- Modo mantenimiento: interruptor y textos editables de la pantalla pública.
-- Columnas aditivas con default: las filas existentes quedan con mantenimiento
-- desactivado y textos por defecto (NULL = usar el texto por defecto del sitio).
-- No borra ni modifica datos existentes.

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN "maintenance_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "site_settings" ADD COLUMN "maintenance_title" VARCHAR(80);
ALTER TABLE "site_settings" ADD COLUMN "maintenance_subtitle" VARCHAR(160);
