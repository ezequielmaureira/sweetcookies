-- Recetas: estado (borrador/completa), notas y rendimiento opcional en borrador.
-- Las recetas existentes quedan COMPLETE (default). No borra ni modifica datos.

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'COMPLETE');

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "notes" VARCHAR(1000),
ADD COLUMN     "status" "RecipeStatus" NOT NULL DEFAULT 'COMPLETE',
ALTER COLUMN "yield_quantity" DROP NOT NULL;

