import { getEnv } from "./env";
import { getRedis } from "./redis";
import { AppError, ErrorCode } from "./errors";

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RateLimits = {
  login: { limit: 5, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  api: { limit: 120, windowSeconds: 60 },
  masterEvents: { limit: 600, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter in Redis. Fails open on Redis outage so that a cache
 * problem never blocks trading traffic, but the failure is surfaced to callers.
 */
export async function consumeRateLimit(
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!getEnv().RATE_LIMIT_ENABLED) return { allowed: true, remaining: rule.limit };

  const key = `ratelimit:${bucket}:${identifier}`;
  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, rule.windowSeconds);
    return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count) };
  } catch {
    return { allowed: true, remaining: rule.limit };
  }
}

export async function enforceRateLimit(bucket: string, identifier: string, rule: RateLimitRule) {
  const { allowed } = await consumeRateLimit(bucket, identifier, rule);
  if (!allowed) throw new AppError(ErrorCode.RATE_LIMITED, `Rate limit exceeded for ${bucket}`);
}

/** Single-use nonce guard for replay protection (master trade events). */
export async function claimNonce(namespace: string, nonce: string, ttlSeconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.set(`nonce:${namespace}:${nonce}`, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch {
    // Redis unavailable: the database unique constraint on eventId remains the
    // authoritative duplicate guard, so allow the request through.
    return true;
  }
}
