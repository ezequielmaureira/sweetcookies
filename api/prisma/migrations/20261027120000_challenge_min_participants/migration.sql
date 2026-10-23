-- Sweet Click Challenge: mínimo de participantes válidos para adjudicar el premio.
-- Columna opcional: los torneos existentes quedan en NULL (sin mínimo, sin cambios
-- retroactivos). No borra ni modifica datos.

-- AlterTable
ALTER TABLE "challenge_editions" ADD COLUMN "min_participants" INTEGER;
