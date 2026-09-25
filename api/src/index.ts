import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createClerkAuth } from "./auth.ts";
import { loadEnv } from "./env.ts";
import { createProductRepository } from "./catalog-repository.ts";
import { createImageRepository } from "./image-repository.ts";
import { createOrderRepository } from "./order-repository.ts";
import { createPrismaClient, createSettingsRepository } from "./repository.ts";

const env = loadEnv();
const prisma = createPrismaClient(env.databaseUrl);
const repo = createSettingsRepository(prisma);
const products = createProductRepository(prisma);
const orders = createOrderRepository(prisma);
const images = createImageRepository(prisma);
const auth = createClerkAuth({
  secretKey: env.clerkSecretKey,
  publishableKey: env.clerkPublishableKey,
  authorizedParties: env.allowedOrigins,
  adminEmails: env.adminEmails,
});

const app = createApp({ repo, products, orders, images, auth, allowedOrigins: env.allowedOrigins });

const server = serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, (info) => {
  // No se loguean los emails: solo cuántos admins hay configurados.
  console.log(
    `sweetcookies-api escuchando en :${info.port} · orígenes admin: ${env.allowedOrigins.join(", ")} · admins configurados: ${env.adminEmails.size}`,
  );
  if (env.adminEmails.size === 0) console.warn("ADMIN_EMAILS vacío: nadie puede usar /api/admin.");
});

const shutdown = () => {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
