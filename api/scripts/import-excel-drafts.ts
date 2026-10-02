/**
 * Importación de las recetas del Excel que todavía están INCOMPLETAS, como BORRADOR.
 * (La carga inicial de ingredientes, precios, FERRERO y NUTELLA está en
 * import-excel-initial.ts; este script no toca esas dos recetas.)
 *
 * IDEMPOTENTE:
 *   - Ingredientes: por nombre normalizado (sin acentos ni mayúsculas); nunca se duplican.
 *   - Recetas: por nombre normalizado; si ya existe NO se toca (tampoco sus líneas).
 *
 * NADA INVENTADO: los ingredientes pendientes (rellenos, ralladura) se crean SIN
 * precio y NO se agregan como línea de receta (no hay cantidad verificable):
 * quedan nombrados en las notas. FRANUI queda sin rendimiento (el Excel dice 6 y 8).
 *
 * Uso (desde api/, con la DATABASE_URL de PRODUCCIÓN — la que tiene Fly):
 *   node scripts/import-excel-drafts.ts            → simulación (no escribe)
 *   node scripts/import-excel-drafts.ts --apply    → aplica en una transacción
 */
import { Prisma } from "../src/generated/prisma/client.ts";
import { createPrismaClient } from "../src/repository.ts";

const D = Prisma.Decimal;
type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
type Unit = "G" | "ML" | "UNIT";
/** Simulación: se deshace la transacción a propósito. */
class DryRun extends Error {}

/**
 * Ingredientes pendientes, SIN precio. La unidad base es provisoria: se puede
 * cambiar desde el Admin mientras no tengan precios ni estén en recetas.
 */
const PENDING_INGREDIENTS: [string, BaseUnit][] = [
  ["RALLADURA LIMÓN", "UNIT"],
  ["GANACHE BLANCO", "GRAM"],
  ["DULCE DE FRAMBUESAS", "GRAM"],
  ["DULCE DE LECHE REPOSTERO", "GRAM"],
  ["QUESO CREMA", "GRAM"],
  ["CHOCOLINA", "UNIT"],
  ["CHOCOLATE BLANCO", "GRAM"],
  ["CREMA DE LECHE", "MILLILITER"],
  ["OREO", "UNIT"],
  ["PASTA DE PISTACHO", "GRAM"],
  ["PISTACHOS", "GRAM"],
  ["MASCARPONE EN POLVO", "GRAM"],
  ["AZÚCAR IMPALPABLE", "GRAM"],
];

type DraftRecipe = { name: string; yieldQuantity: number | null; notes: string; lines: [string, string, Unit][] };

const DRAFTS: DraftRecipe[] = [
  {
    name: "LIMÓN",
    yieldQuantity: 8,
    notes:
      "Pendiente completar relleno: ganache blanco y dulce de frambuesas (cantidades).\nRalladura de limón: falta definir la cantidad de uso (el Excel no la tiene clara).",
    lines: [
      ["HARINA 0000", "300", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "2", "G"],
      ["MANTECA", "130", "G"],
      ["AZÚCAR RUBIA", "56", "G"],
      ["AZÚCAR COMÚN", "120", "G"],
      ["HUEVOS", "2", "UNIT"],
    ],
  },
  {
    name: "CHOCOLINA",
    yieldQuantity: 8,
    notes: "Pendiente completar relleno: dulce de leche repostero, queso crema y chocolina (cantidades).",
    lines: [
      ["HARINA 0000", "220", "G"],
      ["CACAO AMARGO", "30", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "1.25", "G"],
      ["MANTECA", "105", "G"],
      ["AZÚCAR RUBIA", "120", "G"],
      ["AZÚCAR COMÚN", "64", "G"],
      ["HUEVOS", "1", "UNIT"],
    ],
  },
  {
    name: "RED VELVET",
    yieldQuantity: 8,
    notes: "Pendiente completar relleno: chocolate blanco (cantidad).",
    lines: [
      ["HARINA 0000", "250", "G"],
      ["CACAO AMARGO", "15", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "1.25", "G"],
      ["MANTECA", "105", "G"],
      ["AZÚCAR RUBIA", "150", "G"],
      ["AZÚCAR COMÚN", "40", "G"],
      ["HUEVOS", "1", "UNIT"],
      ["CHIPS BLANCOS", "100", "G"],
    ],
  },
  {
    name: "OREO",
    yieldQuantity: 8,
    notes: "Pendiente completar relleno: crema de leche, chocolate blanco y oreo (cantidades).",
    lines: [
      ["HARINA 0000", "230", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "1.25", "G"],
      ["MANTECA", "115", "G"],
      ["AZÚCAR RUBIA", "130", "G"],
      ["AZÚCAR COMÚN", "56", "G"],
      ["HUEVOS", "1", "UNIT"],
      ["ESENCIA DE VAINILLA", "5", "ML"],
      ["CHIPS BLANCOS", "100", "G"],
    ],
  },
  {
    name: "PISTACHO",
    yieldQuantity: 8,
    notes: "Pendiente relleno: pasta de pistacho, chocolate blanco, crema y pistachos.",
    lines: [
      ["HARINA 0000", "240", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "1.25", "G"],
      ["MANTECA", "115", "G"],
      ["AZÚCAR RUBIA", "130", "G"],
      ["AZÚCAR COMÚN", "56", "G"],
      ["HUEVOS", "1", "UNIT"],
      ["ESENCIA DE VAINILLA", "5", "ML"],
      ["CHIPS BLANCOS", "135", "G"],
      ["PISTACHOS PELADOS SIN SAL", "65", "G"],
    ],
  },
  {
    name: "TIRAMISÚ",
    yieldQuantity: 8,
    notes: "Pendiente relleno: mascarpone en polvo, queso crema, azúcar impalpable y esencia de vainilla (cantidades).",
    lines: [
      ["HARINA 0000", "310", "G"],
      ["CACAO AMARGO", "10", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "2", "G"],
      ["MANTECA", "157", "G"],
      ["AZÚCAR RUBIA", "120", "G"],
      ["AZÚCAR COMÚN", "130", "G"],
      ["HUEVOS", "2", "UNIT"],
      ["CHIPS SEMI AMARGO", "100", "G"],
      ["CAFÉ", "10", "G"],
      ["LICOR DE CAFÉ", "5", "ML"],
    ],
  },
  {
    name: "FRANUI",
    // El Excel dice "SALEN 6 UNIDADES" y también "RECETA PARA 8 COOKIES": no se elige ninguno.
    yieldQuantity: null,
    notes:
      "Excel inconsistente: indica 6 unidades y también receta para 8. Confirmar rendimiento.\nPendiente completar relleno (el Excel lo tiene por cookie: chocolate blanco, crema de leche, dulce de frambuesa, corazón de frambuesa y chocolate negro).",
    lines: [
      ["HARINA 0000", "220", "G"],
      ["CACAO AMARGO", "30", "G"],
      ["POLVO DE HORNEAR", "5", "G"],
      ["BICARBONATO DE SODIO", "1.25", "G"],
      ["MANTECA", "105", "G"],
      ["AZÚCAR RUBIA", "120", "G"],
      ["AZÚCAR COMÚN", "64", "G"],
      ["HUEVOS", "1", "UNIT"],
    ],
  },
];

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const UNIT_BASE: Record<Unit, BaseUnit> = { G: "GRAM", ML: "MILLILITER", UNIT: "UNIT" };

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

      for (const [name, baseUnit] of PENDING_INGREDIENTS) {
        const found = byName.get(normalize(name));
        if (found) {
          log.push(`= ingrediente ${found.name} ya existía`);
          continue;
        }
        const created = await tx.ingredient.create({ data: { name, baseUnit }, select: { id: true, name: true, baseUnit: true } });
        byName.set(normalize(name), created);
        log.push(`+ ingrediente ${name} (${baseUnit}, sin precio)`);
      }

      const recipeNames = new Set((await tx.recipe.findMany({ select: { name: true } })).map((r) => normalize(r.name)));
      for (const draft of DRAFTS) {
        if (recipeNames.has(normalize(draft.name))) {
          log.push(`= receta ${draft.name} ya existía (no se modifica)`);
          continue;
        }
        const rows = draft.lines.map(([ingredientName, quantity, unit], position) => {
          const ingredient = byName.get(normalize(ingredientName));
          if (!ingredient) throw new Error(`Falta el ingrediente ${ingredientName} (se cancela todo)`);
          if (ingredient.baseUnit !== UNIT_BASE[unit]) throw new Error(`${ingredient.name}: unidad ${unit} no corresponde a ${ingredient.baseUnit} (se cancela todo)`);
          return { ingredientId: ingredient.id, quantity: new D(quantity), unit, position };
        });
        const recipe = await tx.recipe.create({ data: { name: draft.name, yieldQuantity: draft.yieldQuantity, status: "DRAFT", notes: draft.notes } });
        await tx.recipeIngredient.createMany({ data: rows.map((r) => ({ ...r, recipeId: recipe.id })) });
        recipeNames.add(normalize(draft.name));
        log.push(`+ receta ${draft.name} BORRADOR (rinde ${draft.yieldQuantity ?? "pendiente"}, ${rows.length} ingredientes)`);
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
