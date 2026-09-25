import type { PrismaClient } from "./generated/prisma/client.ts";
import { centsToDecimalString, decimalToCents } from "./money.ts";
import { duplicateData, type ProductData, type ProductRecord } from "./products.ts";

export type ProductRepository = {
  /** Catálogo del comprador: ACTIVE, con stock y con precio. Destacados primero. */
  listPublic(): Promise<ProductRecord[]>;
  /** Todos (admin), destacados primero y después el orden del catálogo. */
  listAll(): Promise<ProductRecord[]>;
  create(data: ProductData): Promise<ProductRecord>;
  /** null si no existe. */
  update(id: string, data: Partial<ProductData>): Promise<ProductRecord | null>;
  /** false si no existe. Los pedidos conservan su snapshot (product_id queda en null). */
  remove(id: string): Promise<boolean>;
  duplicate(id: string): Promise<ProductRecord | null>;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: { toFixed(digits: number): string };
  cost: { toFixed(digits: number): string };
  stock: number;
  imageUrl: string | null;
  category: string | null;
  status: "ACTIVE" | "PAUSED";
  featured: boolean;
  sortOrder: number;
  boxImageUrl: string | null;
  boxImageScale: number;
  boxImageX: number;
  boxImageY: number;
  boxImageRotation: number;
  createdAt: Date;
  updatedAt: Date;
};

export function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: decimalToCents(row.price),
    costCents: decimalToCents(row.cost),
    stock: row.stock,
    imageUrl: row.imageUrl,
    category: row.category,
    status: row.status,
    featured: row.featured,
    sortOrder: row.sortOrder,
    boxImageUrl: row.boxImageUrl,
    boxImageScale: row.boxImageScale,
    boxImageX: row.boxImageX,
    boxImageY: row.boxImageY,
    boxImageRotation: row.boxImageRotation,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Datos de dominio → columnas de Prisma (el dinero viaja como string decimal exacto). */
function toColumns(data: Partial<ProductData>) {
  const { priceCents, costCents, ...rest } = data;
  return {
    ...rest,
    ...(priceCents !== undefined ? { price: centsToDecimalString(priceCents) } : {}),
    ...(costCents !== undefined ? { cost: centsToDecimalString(costCents) } : {}),
  };
}

/** Columnas completas para crear (todos los campos obligatorios presentes). */
function toCreateColumns(data: ProductData, sortOrder: number) {
  const { priceCents, costCents, ...rest } = data;
  return { ...rest, price: centsToDecimalString(priceCents), cost: centsToDecimalString(costCents), sortOrder };
}

const CATALOG_ORDER = [{ featured: "desc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }];

const isNotFound = (error: unknown) => (error as { code?: string })?.code === "P2025";

export function createProductRepository(prisma: PrismaClient): ProductRepository {
  const nextSortOrder = async () => ((await prisma.product.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;

  return {
    async listPublic() {
      const rows = await prisma.product.findMany({
        where: { status: "ACTIVE", stock: { gt: 0 }, price: { gt: 0 } },
        orderBy: CATALOG_ORDER,
      });
      return rows.map(toProductRecord);
    },

    async listAll() {
      return (await prisma.product.findMany({ orderBy: CATALOG_ORDER })).map(toProductRecord);
    },

    async create(data) {
      const row = await prisma.product.create({
        data: toCreateColumns(data, await nextSortOrder()),
      });
      return toProductRecord(row);
    },

    async update(id, data) {
      try {
        return toProductRecord(await prisma.product.update({ where: { id }, data: toColumns(data) }));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async remove(id) {
      try {
        await prisma.product.delete({ where: { id } });
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },

    async duplicate(id) {
      const original = await prisma.product.findUnique({ where: { id } });
      if (!original) return null;
      const data = duplicateData(toProductRecord(original));
      const row = await prisma.product.create({
        data: toCreateColumns(data, await nextSortOrder()),
      });
      return toProductRecord(row);
    },
  };
}
