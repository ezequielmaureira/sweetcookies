-- Equivalencias opcionales por ingrediente: "1 unidad = X g" / "1 unidad = X ml".
-- Solo agrega columnas nulas: no modifica ingredientes, compras, recetas ni historial.

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "grams_per_unit" DECIMAL(14,4),
ADD COLUMN     "ml_per_unit" DECIMAL(14,4);

