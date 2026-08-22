import Redis from "ioredis";
import { getEnv } from "./env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Shared connection for cache-style usage (not for BullMQ workers). */
export function getRedis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;
  const client = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  if (process.env.NODE_ENV !== "production") globalForRedis.redis = client;
  return client;
}

/** BullMQ requires its own connection options (no shared client reuse). */
export function redisConnectionOptions() {
  return { url: getEnv().REDIS_URL, maxRetriesPerRequest: null as null };
}
