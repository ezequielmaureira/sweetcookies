-- AlterTable
ALTER TABLE "products" ADD COLUMN     "box_image_rotation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "box_image_scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "box_image_url" VARCHAR(500),
ADD COLUMN     "box_image_x" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "box_image_y" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "product_images" (
    "id" VARCHAR(40) NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64),

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- Rangos del encuadre de la vista en caja (además de la validación del servidor).
ALTER TABLE "products" ADD CONSTRAINT "products_box_image_scale_range" CHECK ("box_image_scale" >= 1 AND "box_image_scale" <= 4);
ALTER TABLE "products" ADD CONSTRAINT "products_box_image_x_range" CHECK ("box_image_x" >= 0 AND "box_image_x" <= 100);
ALTER TABLE "products" ADD CONSTRAINT "products_box_image_y_range" CHECK ("box_image_y" >= 0 AND "box_image_y" <= 100);
ALTER TABLE "products" ADD CONSTRAINT "products_box_image_rotation_range" CHECK ("box_image_rotation" >= -180 AND "box_image_rotation" <= 180);

-- Imágenes subidas: tipos permitidos y tamaño máximo (1,5 MB).
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_content_type" CHECK ("content_type" IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_size" CHECK ("size" > 0 AND "size" <= 1572864);
