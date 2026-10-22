-- Sweet Click Challenge: datos de contacto del participante (antes de jugar) y
-- foto del premio. Solo agrega columnas opcionales y un índice: no borra ni
-- modifica datos existentes.

-- AlterTable
ALTER TABLE "challenge_editions" ADD COLUMN "prize_image_url" VARCHAR(100);

-- AlterTable
ALTER TABLE "challenge_participants" ADD COLUMN "full_name" VARCHAR(60),
ADD COLUMN "phone" VARCHAR(16),
ADD COLUMN "contact_updated_at" TIMESTAMP(3),
ADD COLUMN "contact_terms_version" VARCHAR(30);

-- CreateIndex
CREATE INDEX "challenge_participants_phone_idx" ON "challenge_participants"("phone");
