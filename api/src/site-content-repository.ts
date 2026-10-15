import type { Prisma, PrismaClient } from "./generated/prisma/client.ts";
import { siteTextDefinition, type SiteTextChange, type SiteTextRow } from "./site-content.ts";
import { framingKey, siteImageDefinition, type SiteImageFraming } from "./site-images.ts";

export type SiteContentRepository = {
  list(): Promise<SiteTextRow[]>;
  /** Guarda todos los cambios juntos (null = se borra la fila y vuelve el original). */
  save(changes: SiteTextChange[], userId: string): Promise<SiteTextRow[]>;
  /**
   * Guarda la ruta de una foto del sitio y su encuadre, juntos.
   * url null = vuelve la original; framing null = encuadre centrado (se borran las filas).
   */
  saveImage(key: string, url: string | null, framing: SiteImageFraming | null, userId: string): Promise<SiteTextRow[]>;
};

const select = { key: true, value: true, updatedAt: true } as const;

export function createSiteContentRepository(prisma: PrismaClient): SiteContentRepository {
  const list = () => prisma.siteContent.findMany({ select, orderBy: { key: "asc" } });
  return {
    list,
    async save(changes, userId) {
      const current = new Map((await list()).map((r) => [r.key, r.value]));
      // Solo se escriben los textos que realmente cambiaron (la auditoría queda en esos).
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      for (const { key, value } of changes) {
        if ((current.get(key) ?? null) === value) continue;
        if (value === null) {
          ops.push(prisma.siteContent.deleteMany({ where: { key } }));
          continue;
        }
        const def = siteTextDefinition(key);
        if (!def) continue;
        const meta = { section: def.section, label: def.label, description: def.description ?? null };
        ops.push(
          prisma.siteContent.upsert({
            where: { key },
            create: { key, value, ...meta, updatedByUserId: userId },
            update: { value, ...meta, updatedByUserId: userId },
          }),
        );
      }
      if (ops.length) await prisma.$transaction(ops);
      return list();
    },
    async saveImage(key, url, framing, userId) {
      const def = siteImageDefinition(key);
      if (!def) return list();
      const meta = { section: def.section, description: def.description };
      const write = (rowKey: string, label: string, value: string | null) =>
        value === null
          ? prisma.siteContent.deleteMany({ where: { key: rowKey } })
          : prisma.siteContent.upsert({
              where: { key: rowKey },
              create: { key: rowKey, value, label, ...meta, updatedByUserId: userId },
              update: { value, label, ...meta, updatedByUserId: userId },
            });
      // Foto y encuadre juntos: o se guardan los dos o ninguno.
      await prisma.$transaction([
        write(key, def.label, url),
        write(framingKey(key), `${def.label} · encuadre`.slice(0, 80), framing ? JSON.stringify(framing) : null),
      ]);
      return list();
    },
  };
}
