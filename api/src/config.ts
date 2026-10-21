export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string | null;
  ingestApiKey: string | null;
  cacheTtlSeconds: number;
  ingestRateLimitPerMinute: number;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: int(env.PORT, 4000),
    databaseUrl: env.DATABASE_URL ?? "postgres://ops:ops@localhost:5432/agent_ops",
    redisUrl: env.REDIS_URL || null,
    ingestApiKey: env.INGEST_API_KEY || null,
    cacheTtlSeconds: int(env.CACHE_TTL_SECONDS, 30),
    ingestRateLimitPerMinute: int(env.INGEST_RATE_LIMIT_PER_MINUTE, 120),
  };
}
