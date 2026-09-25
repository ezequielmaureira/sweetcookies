import type { PrismaClient } from "./generated/prisma/client.ts";
import type { ImageType } from "./images.ts";

export type StoredImage = { contentType: string; data: Uint8Array };

export type ImageRepository = {
  save(input: { type: ImageType; data: Uint8Array; width: number | null; height: number | null; createdBy: string }): Promise<string>;
  get(id: string): Promise<StoredImage | null>;
};

export function createImageRepository(prisma: PrismaClient): ImageRepository {
  return {
    async save({ type, data, width, height, createdBy }) {
      const row = await prisma.productImage.create({
        data: { contentType: type, data: Uint8Array.from(data), size: data.length, width, height, createdBy },
        select: { id: true },
      });
      return row.id;
    },
    async get(id) {
      const row = await prisma.productImage.findUnique({ where: { id }, select: { contentType: true, data: true } });
      return row ? { contentType: row.contentType, data: row.data } : null;
    },
  };
}
