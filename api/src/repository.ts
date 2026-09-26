import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import { DEFAULT_SETTINGS, SETTINGS_ID, type AdminSettings, type OrdersPatch, type SettingsUpdate } from "./settings.ts";

export type SettingsRepository = {
  get(): Promise<AdminSettings>;
  update(data: SettingsUpdate, updatedBy: string): Promise<AdminSettings>;
  /** Cambio parcial del interruptor de pedidos (no toca el resto). */
  updateOrders(data: OrdersPatch, updatedBy: string): Promise<AdminSettings>;
  ping(): Promise<void>;
};

/** Un único cliente Prisma (adapter pg) compartido por todos los repositorios. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

type SettingsRow = {
  whatsappNumber: string | null;
  instagramHandle: string | null;
  ordersEnabled: boolean;
  ordersDisabledMessage: string | null;
  updatedAt: Date;
};

export const toSettings = (row: SettingsRow | null): AdminSettings =>
  row
    ? {
        whatsappNumber: row.whatsappNumber,
        instagramHandle: row.instagramHandle,
        ordersEnabled: row.ordersEnabled,
        ordersDisabledMessage: row.ordersDisabledMessage,
        updatedAt: row.updatedAt.toISOString(),
      }
    : { ...DEFAULT_SETTINGS, updatedAt: null };

export function createSettingsRepository(prisma: PrismaClient): SettingsRepository {
  return {
    async get() {
      return toSettings(await prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } }));
    },
    async update(data, updatedBy) {
      // Singleton: siempre el mismo registro "global".
      const row = await prisma.siteSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS, ...data, updatedBy },
        update: { ...data, updatedBy },
      });
      return toSettings(row);
    },
    async updateOrders(data, updatedBy) {
      const row = await prisma.siteSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS, ...data, updatedBy },
        update: { ...data, updatedBy },
      });
      return toSettings(row);
    },
    async ping() {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}
