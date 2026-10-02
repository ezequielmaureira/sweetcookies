import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";
import {
  generatePublicId,
  generateVoucherCode,
  voucherWhere,
  type VoucherInput,
  type VoucherListQuery,
  type VoucherRecord,
} from "./vouchers.ts";

export type VoucherList = {
  vouchers: VoucherRecord[];
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
};

/** Resultado de un canje/anulación: ok, o el voucher tal como está ahora (para explicar por qué no). */
export type VoucherTransition = { ok: true; voucher: VoucherRecord } | { ok: false; voucher: VoucherRecord | null };

export type VoucherRepository = {
  create(input: VoucherInput, createdByUserId: string): Promise<VoucherRecord>;
  list(query: VoucherListQuery): Promise<VoucherList>;
  getByPublicId(publicId: string): Promise<VoucherRecord | null>;
  /** Búsqueda manual del admin (código ya normalizado: SC-XXXXXX). */
  getByCode(code: string): Promise<VoucherRecord | null>;
  /** Canje ATÓMICO: solo si sigue ACTIVE y no venció. Nunca dos veces. */
  redeem(publicId: string, userId: string): Promise<VoucherTransition>;
  /** Anulación atómica: solo si sigue ACTIVE. */
  cancel(publicId: string, userId: string): Promise<VoucherTransition>;
  /** Eliminación definitiva, en cualquier estado. null = no existía. */
  remove(publicId: string): Promise<VoucherRecord | null>;
};

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export function createVoucherRepository(prisma: PrismaClient): VoucherRepository {
  return {
    async create(input, createdByUserId) {
      // Código y publicId aleatorios; si coinciden con uno existente (muy improbable),
      // el índice único lo rechaza y se reintenta con valores nuevos.
      for (let attempt = 0; ; attempt++) {
        try {
          return await prisma.voucher.create({
            data: {
              publicId: generatePublicId(),
              code: generateVoucherCode(),
              cookieQuantity: input.cookieQuantity,
              expiresAt: input.expiresAt,
              description: input.description,
              createdByUserId,
            },
          });
        } catch (error) {
          if (!isUniqueViolation(error) || attempt >= 4) throw error;
        }
      }
    },

    async list(query) {
      const where = voucherWhere(query.filter);
      const [total, vouchers] = await Promise.all([
        prisma.voucher.count({ where }),
        prisma.voucher.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { vouchers, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
    },

    async getByPublicId(publicId) {
      return prisma.voucher.findUnique({ where: { publicId } });
    },

    async getByCode(code) {
      return prisma.voucher.findUnique({ where: { code } });
    },

    async redeem(publicId, userId) {
      const now = new Date();
      // Un único UPDATE condicional: la base decide. Si dos teléfonos canjean a la
      // vez, solo uno ve count === 1; el otro no modifica nada.
      const { count } = await prisma.voucher.updateMany({
        where: { publicId, status: "ACTIVE", expiresAt: { gte: now } },
        data: { status: "REDEEMED", redeemedAt: now, redeemedByUserId: userId },
      });
      const voucher = await prisma.voucher.findUnique({ where: { publicId } });
      return count === 1 && voucher ? { ok: true, voucher } : { ok: false, voucher };
    },

    async cancel(publicId, userId) {
      const now = new Date();
      const { count } = await prisma.voucher.updateMany({
        where: { publicId, status: "ACTIVE" },
        data: { status: "CANCELLED", cancelledAt: now, cancelledByUserId: userId },
      });
      const voucher = await prisma.voucher.findUnique({ where: { publicId } });
      return count === 1 && voucher ? { ok: true, voucher } : { ok: false, voucher };
    },
    async remove(publicId) {
      const voucher = await prisma.voucher.findUnique({ where: { publicId } });
      if (!voucher) return null;
      const { count } = await prisma.voucher.deleteMany({ where: { publicId } });
      return count === 1 ? voucher : null;
    },
  };
}
