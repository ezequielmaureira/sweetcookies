-- Tipo de producto: COOKIE (puede ir dentro del box) u OTHER (budín, torta, brownie…:
-- se compra suelto y nunca ocupa lugar en el box). Solo agrega columnas con valor
-- por defecto: los productos y pedidos existentes quedan como COOKIE, sin cambios de datos.

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('COOKIE', 'OTHER');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'COOKIE';

-- AlterTable: copia histórica del tipo en cada línea del pedido.
ALTER TABLE "order_items" ADD COLUMN     "product_kind" "ProductKind" NOT NULL DEFAULT 'COOKIE';
