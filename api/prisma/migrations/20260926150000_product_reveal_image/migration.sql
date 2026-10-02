-- "Descubrí el relleno": foto OPCIONAL de la cookie abierta (se revela al raspar la foto principal).
-- Columna nueva y nullable: no modifica ni borra datos existentes (todos los productos quedan sin la experiencia).
ALTER TABLE "products" ADD COLUMN "reveal_image_url" VARCHAR(500);
