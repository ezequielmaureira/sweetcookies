-- Partes de la receta (masa / relleno / terminación) en cada línea.
-- Las líneas existentes quedan UNASSIGNED ("Sin clasificar"): no se pierde ni se inventa nada.

-- CreateEnum
CREATE TYPE "RecipeComponent" AS ENUM ('UNASSIGNED', 'DOUGH', 'FILLING', 'FINISHING');

-- AlterTable
ALTER TABLE "recipe_ingredients" ADD COLUMN     "component" "RecipeComponent" NOT NULL DEFAULT 'UNASSIGNED';

