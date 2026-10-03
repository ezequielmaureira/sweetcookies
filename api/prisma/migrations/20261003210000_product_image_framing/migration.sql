-- Encuadre de la foto principal del producto (zoom y posición). Columnas nuevas con
-- valores por defecto = como se ve hoy (centrada, sin zoom). No modifica datos.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "image_scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "image_x" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "image_y" DOUBLE PRECISION NOT NULL DEFAULT 50;

