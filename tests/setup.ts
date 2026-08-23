import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Deterministic test environment. Real secrets never come from the repository —
 * these are generated per run and only satisfy env validation.
 */
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV ??= "test";
// Integration tests use the development database when .env provides one; unit
// tests only need the variable to satisfy env validation.
if (!env.DATABASE_URL) {
  try {
    const dotenv = readFileSync(new URL("../.env", import.meta.url), "utf8");
    env.DATABASE_URL = dotenv.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
  } catch {
    // no .env — fall through to the placeholder below
  }
}
env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test?schema=public";
env.REDIS_URL ??= "redis://localhost:6379";
env.AUTH_SECRET ??= randomBytes(48).toString("base64");

// Integration fixtures store encrypted credentials, so the key has to match the
// one the application uses — a per-run key would leave rows nothing can decrypt.
if (!env.ENCRYPTION_KEY) {
  try {
    const dotenv = readFileSync(new URL("../.env", import.meta.url), "utf8");
    env.ENCRYPTION_KEY = dotenv.match(/^ENCRYPTION_KEY=(.*)$/m)?.[1]?.trim();
  } catch {
    // no .env — a random key is fine for unit tests
  }
}
env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
env.MASTER_API_KEY ??= randomBytes(16).toString("hex");
env.MASTER_API_SECRET ??= randomBytes(32).toString("hex");
env.RATE_LIMIT_ENABLED ??= "false";
