-- Se elimina "Terminación": las partes de una receta quedan en Masa y Relleno.
-- Primero, cualquier línea en Terminación pasa a Relleno (solo cambia la clasificación).
UPDATE "recipe_ingredients" SET "component" = 'FILLING' WHERE "component" = 'FINISHING';

-- AlterEnum
BEGIN;
CREATE TYPE "RecipeComponent_new" AS ENUM ('UNASSIGNED', 'DOUGH', 'FILLING');
ALTER TABLE "recipe_ingredients" ALTER COLUMN "component" DROP DEFAULT;
ALTER TABLE "recipe_ingredients" ALTER COLUMN "component" TYPE "RecipeComponent_new" USING ("component"::text::"RecipeComponent_new");
ALTER TYPE "RecipeComponent" RENAME TO "RecipeComponent_old";
ALTER TYPE "RecipeComponent_new" RENAME TO "RecipeComponent";
DROP TYPE "RecipeComponent_old";
ALTER TABLE "recipe_ingredients" ALTER COLUMN "component" SET DEFAULT 'UNASSIGNED';
COMMIT;

