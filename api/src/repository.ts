import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import { DEFAULT_SETTINGS, SETTINGS_ID, type AdminSettings, type SiteSettingsData } from "./settings.ts";

export type SettingsRepository = {
  get(): Promise<AdminSettings>;
  update(data: SiteSettingsData, updatedBy: string): Promise<AdminSettings>;
  ping(): Promise<void>;
};

export function createPrismaRepository(databaseUrl: string): SettingsRepository & { disconnect(): Promise<void> } {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  const toSettings = (row: {
    whatsappNumber: string | null;
    instagramHandle: string | null;
    whatsappOrdersEnabled: boolean;
    updatedAt: Date;
  } | null): AdminSettings =>
    row
      ? {
          whatsappNumber: row.whatsappNumber,
          instagramHandle: row.instagramHandle,
          whatsappOrdersEnabled: row.whatsappOrdersEnabled,
          updatedAt: row.updatedAt.toISOString(),
        }
      : { ...DEFAULT_SETTINGS, updatedAt: null };

  return {
    async get() {
      return toSettings(await prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } }));
    },
    async update(data, updatedBy) {
      // Singleton: siempre el mismo registro "global".
      const row = await prisma.siteSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, ...data, updatedBy },
        update: { ...data, updatedBy },
      });
      return toSettings(row);
    },
    async ping() {
      await prisma.$queryRaw`SELECT 1`;
    },
    disconnect: () => prisma.$disconnect(),
  };
}
