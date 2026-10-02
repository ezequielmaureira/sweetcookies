-- Gestión: ingredientes, historial de precios y recetas (solo tablas y tipos NUEVOS).
-- No modifica ni borra datos existentes. Las tablas quedan vacías.

-- CreateEnum
CREATE TYPE "IngredientBaseUnit" AS ENUM ('GRAM', 'MILLILITER', 'UNIT');

-- CreateEnum
CREATE TYPE "MeasureUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'UNIT', 'PACKAGE');

-- CreateTable
CREATE TABLE "ingredients" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "base_unit" "IngredientBaseUnit" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_prices" (
    "id" VARCHAR(40) NOT NULL,
    "ingredient_id" VARCHAR(40) NOT NULL,
    "purchase_quantity" DECIMAL(14,4) NOT NULL,
    "purchase_unit" "MeasureUnit" NOT NULL,
    "units_per_package" DECIMAL(14,4),
    "base_quantity" DECIMAL(18,4) NOT NULL,
    "total_price" DECIMAL(14,2) NOT NULL,
    "unit_cost" DECIMAL(20,10) NOT NULL,
    "supplier_name" VARCHAR(80),
    "purchased_at" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "yield_quantity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "product_id" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" VARCHAR(40) NOT NULL,
    "recipe_id" VARCHAR(40) NOT NULL,
    "ingredient_id" VARCHAR(40) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" "MeasureUnit" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_extra_costs" (
    "id" VARCHAR(40) NOT NULL,
    "recipe_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_extra_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredients_name_idx" ON "ingredients"("name");

-- CreateIndex
CREATE INDEX "ingredient_prices_ingredient_id_purchased_at_created_at_idx" ON "ingredient_prices"("ingredient_id", "purchased_at" DESC, "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "recipes_product_id_key" ON "recipes"("product_id");

-- CreateIndex
CREATE INDEX "recipes_name_idx" ON "recipes"("name");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_ingredients_ingredient_id_idx" ON "recipe_ingredients"("ingredient_id");

-- CreateIndex
CREATE INDEX "recipe_extra_costs_recipe_id_idx" ON "recipe_extra_costs"("recipe_id");

-- AddForeignKey
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_extra_costs" ADD CONSTRAINT "recipe_extra_costs_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

