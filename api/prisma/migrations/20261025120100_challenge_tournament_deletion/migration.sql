-- Sweet Click Challenge: eliminación lógica de torneos y torneos reales por defecto (2/2).
-- Solo AGREGA columnas opcionales y un índice a "challenge_editions" y cambia el
-- valor por defecto de "is_test" para filas NUEVAS. No modifica ni borra datos:
-- el torneo histórico de prueba conserva is_test = true, su estado y sus resultados.

ALTER TABLE "challenge_editions"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64),
  ADD COLUMN "delete_reason" VARCHAR(300);

ALTER TABLE "challenge_editions" ALTER COLUMN "is_test" SET DEFAULT false;

CREATE INDEX "challenge_editions_deleted_at_idx" ON "challenge_editions"("deleted_at");
