/**
 * Importación inicial de Gestión desde el Excel "COOKIES 2.0" (02/10/2026).
 *
 * IDEMPOTENTE: se puede ejecutar más de una vez sin duplicar nada.
 *   - Ingredientes: se buscan por nombre normalizado (sin acentos ni mayúsculas).
 *   - Precio inicial: uno por ingrediente con supplierName = "Carga inicial desde Excel".
 *   - Recetas: se buscan por nombre normalizado; si ya existen NO se tocan.
 *
 * Los costos son los COSTOS UNITARIOS que ya usaban las recetas del Excel (no se
 * recalculan desde los encabezados). Se registran como precio de referencia
 * normalizado: 1000 g / 1000 ml / 1 unidad, con el costo unitario exacto.
 * Nada sin dato: lo que no tiene precio queda sin precio (nunca $0).
 *
 * Uso (desde api/, con las variables de la base cargadas):
 *   node scripts/import-excel-initial.ts            → muestra el plan (no escribe)
 *   node scripts/import-excel-initial.ts --apply    → aplica en una transacción
 */
import { Prisma } from "../src/generated/prisma/client.ts";
import { createPrismaClient } from "../src/repository.ts";

const D = Prisma.Decimal;
/** Simulación: se deshace la transacción a propósito. */
class DryRun extends Error {}
type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
type Unit = "G" | "ML" | "UNIT";

export const SUPPLIER = "Carga inicial desde Excel";
const PURCHASED_AT = new Date("2026-10-02T00:00:00.000Z");

/** [nombre, unidad base, costo por unidad base | null = sin precio] */
const INGREDIENTS: [string, BaseUnit, string | null][] = [
  ["HARINA 0000", "GRAM", "0.7956"],
  ["CACAO AMARGO", "GRAM", "20.1045"],
  ["POLVO DE HORNEAR", "GRAM", "21.307"],
  ["BICARBONATO DE SODIO", "GRAM", "13.6833"],
  ["MANTECA", "GRAM", "12.9885"],
  ["AZÚCAR RUBIA", "GRAM", "3"],
  ["AZÚCAR COMÚN", "GRAM", "1.46"],
  ["HUEVOS", "UNIT", "211.11"],
  ["CHIPS SEMI AMARGO", "GRAM", "11.92285"],
  ["CHIPS BLANCOS", "GRAM", "12.63"],
  ["AVELLANAS", "GRAM", "45.418"],
  ["COBERTURA DE CHOCOLATE", "GRAM", "38.39493"],
  ["NUTELLA", "GRAM", "29.32133333333333"],
  ["BARRA NUTELLA", "UNIT", "1590.795"],
  ["PISTACHOS PELADOS SIN SAL", "GRAM", "111.16"],
  ["CAFÉ", "GRAM", "79.027"],
  ["LICOR DE CAFÉ", "MILLILITER", "10.45875"],
  // En el Excel no tiene precio: queda "⚠ Sin precio". No va en Ferrero (corregido 02/10/2026).
  ["ESENCIA DE VAINILLA", "MILLILITER", null],
];

/** [receta, rendimiento, líneas [ingrediente, cantidad, unidad]] — solo las que tienen datos completos. */
const RECIPES: [string, number, [string, string, Unit][]][] = [
  [
    "FERRERO",
    10,
    [
      ["HARINA 0000", "350", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "1.25", "G"],
      ["MANTECA", "175", "G"],
      ["AZÚCAR RUBIA", "150", "G"],
      ["AZÚCAR COMÚN", "80", "G"],
      ["HUEVOS", "2", "UNIT"],
      ["CHIPS SEMI AMARGO", "120", "G"],
      ["AVELLANAS", "50", "G"],
      ["COBERTURA DE CHOCOLATE", "250", "G"],
      ["NUTELLA", "300", "G"],
    ],
  ],
  [
    "NUTELLA",
    8,
    [
      ["HARINA 0000", "350", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "1.25", "G"],
      ["MANTECA", "175", "G"],
      ["AZÚCAR RUBIA", "150", "G"],
      ["AZÚCAR COMÚN", "80", "G"],
      ["HUEVOS", "2", "UNIT"],
      ["CHIPS SEMI AMARGO", "120", "G"],
      ["NUTELLA", "300", "G"],
      ["BARRA NUTELLA", "3", "UNIT"],
    ],
  ],
];

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Precio de referencia normalizado: 1000 g / 1000 ml / 1 unidad. */
function referencePrice(baseUnit: BaseUnit, unitCost: string) {
  const cost = new D(unitCost);
  const quantity = baseUnit === "UNIT" ? new D(1) : new D(1000);
  const unit: Unit = baseUnit === "GRAM" ? "G" : baseUnit === "MILLILITER" ? "ML" : "UNIT";
  return {
    purchaseQuantity: quantity,
    purchaseUnit: unit,
    unitsPerPackage: null,
    baseQuantity: quantity,
    // totalPrice va en centavos (DECIMAL 14,2); el costo unitario se guarda tal cual (10 decimales).
    totalPrice: cost.mul(quantity).toDecimalPlaces(2),
    unitCost: cost.toDecimalPlaces(10),
    supplierName: SUPPLIER,
    purchasedAt: PURCHASED_AT,
  };
}

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL_UNPOOLED / DATABASE_URL");
const prisma = createPrismaClient(url);

const log: string[] = [];
try {
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.ingredient.findMany({ select: { id: true, name: true, baseUnit: true } });
      const byName = new Map(existing.map((i) => [normalize(i.name), i]));

      for (const [name, baseUnit, unitCost] of INGREDIENTS) {
        let ingredient = byName.get(normalize(name));
        if (ingredient && ingredient.baseUnit !== baseUnit) {
          throw new Error(`"${ingredient.name}" ya existe con otra unidad base (${ingredient.baseUnit}); se cancela todo para no mezclar unidades.`);
        }
        if (!ingredient) {
          ingredient = await tx.ingredient.create({ data: { name, baseUnit }, select: { id: true, name: true, baseUnit: true } });
          byName.set(normalize(name), ingredient);
          log.push(`+ ingrediente ${name} (${baseUnit})`);
        } else {
          log.push(`= ingrediente ${ingredient.name} ya existía`);
        }
        if (unitCost === null) {
          log.push(`  sin precio (no se inventa)`);
          continue;
        }
        const already = await tx.ingredientPrice.findFirst({ where: { ingredientId: ingredient.id, supplierName: SUPPLIER }, select: { id: true } });
        if (already) {
          log.push(`  = precio inicial ya cargado`);
          continue;
        }
        await tx.ingredientPrice.create({ data: { ingredientId: ingredient.id, ...referencePrice(baseUnit, unitCost) } });
        log.push(`  + precio inicial ${unitCost} / ${baseUnit}`);
      }

      const recipes = await tx.recipe.findMany({ select: { name: true } });
      const recipeNames = new Set(recipes.map((r) => normalize(r.name)));
      for (const [name, yieldQuantity, lines] of RECIPES) {
        if (recipeNames.has(normalize(name))) {
          log.push(`= receta ${name} ya existía (no se modifica)`);
          continue;
        }
        const recipe = await tx.recipe.create({ data: { name, yieldQuantity } });
        await tx.recipeIngredient.createMany({
          data: lines.map(([ingredientName, quantity, unit], position) => {
            const ingredient = byName.get(normalize(ingredientName));
            if (!ingredient) throw new Error(`Falta el ingrediente ${ingredientName}`);
            return { recipeId: recipe.id, ingredientId: ingredient.id, quantity: new D(quantity), unit, position };
          }),
        });
        log.push(`+ receta ${name} (rinde ${yieldQuantity}, ${lines.length} ingredientes)`);
      }

      if (!apply) throw new DryRun();
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  console.log(log.join("\n"));
  console.log("\nAPLICADO ✓");
} catch (error) {
  if (error instanceof DryRun) {
    console.log(log.join("\n"));
    console.log("\nSIMULACIÓN: no se escribió nada (usar --apply).");
  } else {
    console.error("ERROR — no se aplicó nada:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

