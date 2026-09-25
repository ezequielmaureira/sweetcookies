import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createClerkAuth } from "./auth.ts";
import { loadEnv } from "./env.ts";
import { createPrismaRepository } from "./repository.ts";

const env = loadEnv();
const repo = createPrismaRepository(env.databaseUrl);
const auth = createClerkAuth({
  secretKey: env.clerkSecretKey,
  publishableKey: env.clerkPublishableKey,
  authorizedParties: env.allowedOrigins,
});

const app = createApp({ repo, auth, allowedOrigins: env.allowedOrigins });

const server = serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`sweetcookies-api escuchando en :${info.port} · orígenes admin: ${env.allowedOrigins.join(", ")}`);
});

const shutdown = () => {
  server.close(() => {
    void repo.disconnect().finally(() => process.exit(0));
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
