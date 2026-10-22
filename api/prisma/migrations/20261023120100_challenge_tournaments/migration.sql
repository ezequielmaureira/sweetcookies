-- Sweet Click Challenge → torneos administrables (2/2).
-- Solo toca la tabla del campeonato ("challenge_editions"). No borra filas ni
-- columnas: las ediciones semanales existentes quedan como torneos históricos
-- (de prueba), con sus partidas, participantes, ranking y reclamos intactos.

-- Columnas nuevas del torneo (todas opcionales salvo el nombre).
ALTER TABLE "challenge_editions"
  ADD COLUMN "name" VARCHAR(80),
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "prize_description" VARCHAR(500),
  ADD COLUMN "created_by" VARCHAR(64),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by" VARCHAR(64),
  ADD COLUMN "cancel_reason" VARCHAR(300);

-- Nombre para las ediciones semanales ya existentes (ej. "Prueba · semana del 19/10/2026").
UPDATE "challenge_editions"
SET "name" = CASE WHEN "is_test" THEN 'Prueba' ELSE 'Edición' END
  || ' · semana del ' || to_char(to_date("week_start", 'YYYY-MM-DD'), 'DD/MM/YYYY')
WHERE "name" IS NULL AND "week_start" IS NOT NULL;
UPDATE "challenge_editions" SET "name" = 'Torneo #' || "number" WHERE "name" IS NULL;

ALTER TABLE "challenge_editions" ALTER COLUMN "name" SET NOT NULL;

-- Sin calendario semanal: la semana deja de ser obligatoria y única.
-- (Se conserva la columna con su valor histórico; solo se quita el índice.)
DROP INDEX IF EXISTS "challenge_editions_week_start_is_test_key";
ALTER TABLE "challenge_editions" ALTER COLUMN "week_start" DROP NOT NULL;

-- Los torneos nuevos nacen como borrador y con premio elegido por el admin.
ALTER TABLE "challenge_editions" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "challenge_editions" ALTER COLUMN "prize" DROP DEFAULT;

CREATE INDEX "challenge_editions_status_starts_at_idx" ON "challenge_editions"("status", "starts_at");

-- Límites razonables que la base garantiza aunque falle la validación de la API.
ALTER TABLE "challenge_editions" ADD CONSTRAINT "challenge_editions_attempts_max" CHECK ("attempts" <= 20);
ALTER TABLE "challenge_editions" ADD CONSTRAINT "challenge_editions_name_not_blank" CHECK (length(btrim("name")) > 0);
