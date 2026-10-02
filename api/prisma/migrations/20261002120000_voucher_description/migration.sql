-- Descripción editable del voucher (ej. "Premio sorteo aniversario").
-- NULL en los vouchers existentes: se muestra "Premio donado por Sweet Cookies".
ALTER TABLE "vouchers" ADD COLUMN "description" VARCHAR(120);
