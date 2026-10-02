-- Se elimina "Descubrí el relleno": la foto interior no tiene otro uso.
-- Ningún producto la tenía cargada (0 filas con valor): no se pierden datos.
ALTER TABLE "products" DROP COLUMN "reveal_image_url";
