import { createApp } from "./app";
import { memoryCache, redisCache } from "./cache";
import { loadConfig } from "./config";
import { createDatabase, migrate } from "./db";
import { seed } from "./seed";

async function main() {
  const config = loadConfig();
  const db = createDatabase(config.databaseUrl);
  await migrate(db);

  if (process.env.SEED_DEMO_DATA === "true") {
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM traces");
    if (rows[0].n === 0) {
      const counts = await seed(db);
      console.log(`[api] seeded demo data: ${counts.traces} traces, ${counts.tickets} tickets`);
    }
  }

  const cache = config.redisUrl ? redisCache(config.redisUrl) : memoryCache();
  if (!config.redisUrl) console.warn("[api] REDIS_URL not set: using in-memory cache");

  const app = createApp({
    db,
    cache,
    ingestApiKey: config.ingestApiKey,
    cacheTtlSeconds: config.cacheTtlSeconds,
    ingestRateLimitPerMinute: config.ingestRateLimitPerMinute,
  });

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await Promise.allSettled([db.close(), cache.close()]);
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
