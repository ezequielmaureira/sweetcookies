-- Vouchers de regalo (caja de 4 o 6 cookies) con QR único.
-- "Vencido" no se guarda: se calcula con expires_at < ahora.

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "vouchers" (
    "id" VARCHAR(40) NOT NULL,
    "public_id" VARCHAR(32) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "cookie_quantity" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" VARCHAR(64),
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by_user_id" VARCHAR(64),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" VARCHAR(64),

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_public_id_key" ON "vouchers"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE INDEX "vouchers_created_at_idx" ON "vouchers"("created_at");

-- CreateIndex
CREATE INDEX "vouchers_status_expires_at_idx" ON "vouchers"("status", "expires_at");

-- Reglas que la base garantiza aunque falle la validación de la API.
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cookie_quantity_allowed" CHECK ("cookie_quantity" IN (4, 6));
-- Un voucher canjeado siempre tiene fecha de canje; uno anulado, fecha de anulación.
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_redeemed_has_date" CHECK ("status" <> 'REDEEMED' OR "redeemed_at" IS NOT NULL);
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cancelled_has_date" CHECK ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL);
