import { randomBytes } from "node:crypto";

/**
 * Deterministic test environment. Real secrets never come from the repository —
 * these are generated per run and only satisfy env validation.
 */
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV ??= "test";
env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test?schema=public";
env.REDIS_URL ??= "redis://localhost:6379";
env.AUTH_SECRET ??= randomBytes(48).toString("base64");
env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
env.MASTER_API_KEY ??= randomBytes(16).toString("hex");
env.MASTER_API_SECRET ??= randomBytes(32).toString("hex");
env.RATE_LIMIT_ENABLED ??= "false";
