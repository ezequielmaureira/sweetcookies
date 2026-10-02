/**
 * Clasifica en Masa / Relleno las líneas de receta EXISTENTES (que la migración
 * dejó "Sin clasificar"), solo donde el Excel "COOKIES 2.0" lo dice claro.
 *
 * Criterio (hojas de cada sabor del Excel):
 *   - Lo que está arriba de "TOTAL MASA" / "TOTAL" → MASA.
 *   - Lo que figura bajo "RELLENO" → RELLENO.
 *   - Con duda → queda "Sin clasificar" para que lo decida el admin:
 *       FERRERO · AVELLANAS y COBERTURA DE CHOCOLATE: el Excel las pone en
 *       RELLENO, pero pueden ser terminación.
 *
 * IDEMPOTENTE y conservador: solo cambia líneas que siguen UNASSIGNED (nunca
 * pisa una clasificación hecha desde el Admin). No crea ni borra líneas.
 *
 * Uso (desde api/, con la DATABASE_URL de PRODUCCIÓN — la que tiene Fly):
 *   node scripts/classify-recipe-components.ts            → simulación
 *   node scripts/classify-recipe-components.ts --apply    → aplica en una transacción
 */
import { createPrismaClient } from "../src/repository.ts";

type Component = "DOUGH" | "FILLING";
class DryRun extends Error {}

const DOUGH_BASE = ["HARINA 0000", "POLVO DE HORNEAR", "BICARBONATO DE SODIO", "MANTECA", "AZÚCAR RUBIA", "AZÚCAR COMÚN", "HUEVOS"];

/** receta → { ingrediente: parte }. Lo que no figura acá no se toca. */
const PLAN: Record<string, Record<string, Component>> = {
  FERRERO: { ...Object.fromEntries(DOUGH_BASE.map((n) => [n, "DOUGH" as const])), "CHIPS SEMI AMARGO": "DOUGH", NUTELLA: "FILLING" },
  NUTELLA: { ...Object.fromEntries(DOUGH_BASE.map((n) => [n, "DOUGH" as const])), "CHIPS SEMI AMARGO": "DOUGH", NUTELLA: "FILLING", "BARRA NUTELLA": "FILLING" },
  // Borradores: hoy solo tienen cargada la masa (el relleno está pendiente en las notas).
  LIMÓN: Object.fromEntries(DOUGH_BASE.map((n) => [n, "DOUGH" as const])),
  CHOCOLINA: Object.fromEntries([...DOUGH_BASE, "CACAO AMARGO"].map((n) => [n, "DOUGH" as const])),
  "RED VELVET": Object.fromEntries([...DOUGH_BASE, "CACAO AMARGO", "CHIPS BLANCOS"].map((n) => [n, "DOUGH" as const])),
  OREO: Object.fromEntries([...DOUGH_BASE, "ESENCIA DE VAINILLA", "CHIPS BLANCOS"].map((n) => [n, "DOUGH" as const])),
  PISTACHO: Object.fromEntries([...DOUGH_BASE, "ESENCIA DE VAINILLA", "CHIPS BLANCOS", "PISTACHOS PELADOS SIN SAL"].map((n) => [n, "DOUGH" as const])),
  TIRAMISÚ: Object.fromEntries([...DOUGH_BASE, "CACAO AMARGO", "CHIPS SEMI AMARGO", "CAFÉ", "LICOR DE CAFÉ"].map((n) => [n, "DOUGH" as const])),
  FRANUI: Object.fromEntries([...DOUGH_BASE, "CACAO AMARGO"].map((n) => [n, "DOUGH" as const])),
};

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const plan = new Map(Object.entries(PLAN).map(([recipe, lines]) => [normalize(recipe), new Map(Object.entries(lines).map(([i, c]) => [normalize(i), c]))]));

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL_UNPOOLED / DATABASE_URL");
const prisma = createPrismaClient(url);

const log: string[] = [];
try {
  await prisma.$transaction(
    async (tx) => {
      const lines = await tx.recipeIngredient.findMany({
        select: { id: true, component: true, recipe: { select: { name: true } }, ingredient: { select: { name: true } } },
        orderBy: [{ recipeId: "asc" }, { position: "asc" }],
      });
      for (const line of lines) {
        const target = plan.get(normalize(line.recipe.name))?.get(normalize(line.ingredient.name));
        const label = `${line.recipe.name} · ${line.ingredient.name}`;
        if (line.component !== "UNASSIGNED") log.push(`= ${label}: ya clasificado (${line.component})`);
        else if (!target) log.push(`? ${label}: queda Sin clasificar (revisar)`);
        else {
          await tx.recipeIngredient.update({ where: { id: line.id }, data: { component: target } });
          log.push(`+ ${label} → ${target}`);
        }
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
