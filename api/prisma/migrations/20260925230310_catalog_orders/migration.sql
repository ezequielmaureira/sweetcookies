-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateTable
CREATE TABLE "products" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(400),
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "image_url" VARCHAR(500),
    "category" VARCHAR(40),
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" VARCHAR(40) NOT NULL,
    "number" SERIAL NOT NULL,
    "customer_name" VARCHAR(80) NOT NULL,
    "customer_last_name" VARCHAR(80),
    "customer_phone" VARCHAR(20),
    "customer_email" VARCHAR(120),
    "customer_sort_key" VARCHAR(170) NOT NULL,
    "delivery_method" "DeliveryMethod" NOT NULL,
    "delivery_address" VARCHAR(200),
    "notes" VARCHAR(600),
    "total" DECIMAL(12,2) NOT NULL,
    "profit" DECIMAL(12,2) NOT NULL,
    "item_count" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" VARCHAR(40) NOT NULL,
    "order_id" VARCHAR(40) NOT NULL,
    "product_id" VARCHAR(40),
    "product_name_snapshot" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "profit" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_status_featured_sort_order_idx" ON "products"("status", "featured", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_total_idx" ON "orders"("total");

-- CreateIndex
CREATE INDEX "orders_profit_idx" ON "orders"("profit");

-- CreateIndex
CREATE INDEX "orders_customer_sort_key_idx" ON "orders"("customer_sort_key");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integridad a nivel base (además de la validación del servidor):
-- nunca stock negativo, dinero negativo ni cantidades en cero.
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_cost_non_negative" CHECK ("cost" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_item_count_positive" CHECK ("item_count" > 0);

-- Números de pedido legibles: el primero es #1001.
ALTER SEQUENCE "orders_number_seq" RESTART WITH 1001;

-- Catálogo actual (antes hardcodeado en src/data/cookies.ts), con los mismos ids
-- para que los carritos guardados sigan siendo válidos. Solo datos reales: precio,
-- costo y stock quedan en 0 hasta cargarlos desde /admin/productos (sin stock o
-- sin precio, el producto no se muestra ni se puede comprar).
INSERT INTO "products" ("id", "name", "description", "price", "cost", "stock", "image_url", "category", "status", "featured", "sort_order", "updated_at")
VALUES
  ('cookies-cream',   'Cookies & Cream',   NULL,                          0, 0, 0, '/images/cookies/cookies-cream.jpg',   'Cookies', 'ACTIVE', false, 1, CURRENT_TIMESTAMP),
  ('red-velvet',      'Red Velvet',        NULL,                          0, 0, 0, '/images/cookies/red-velvet.jpg',      'Cookies', 'ACTIVE', false, 2, CURRENT_TIMESTAMP),
  ('pistacho',        'Pistacho',          'Chocolate blanco + pistacho', 0, 0, 0, '/images/cookies/pistacho.jpg',        'Cookies', 'ACTIVE', false, 3, CURRENT_TIMESTAMP),
  ('limon-frambuesa', 'Limón & Frambuesa', NULL,                          0, 0, 0, '/images/cookies/limon-frambuesa.jpg', 'Cookies', 'ACTIVE', false, 4, CURRENT_TIMESTAMP),
  ('chocotorta',      'Chocotorta',        NULL,                          0, 0, 0, '/images/cookies/chocotorta.jpg',      'Cookies', 'ACTIVE', false, 5, CURRENT_TIMESTAMP),
  ('franui',          'Estilo Franui',     NULL,                          0, 0, 0, '/images/cookies/franui.jpg',          'Cookies', 'ACTIVE', false, 6, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
