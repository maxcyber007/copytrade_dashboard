import { z } from "zod";

/**
 * Central, validated access to environment variables.
 * Never import process.env directly outside of this module.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),

  ENCRYPTION_KEY: z.string().min(1),

  MT5_PROVIDER: z.enum(["mock", "metaapi"]).default("mock"),
  METAAPI_TOKEN: z.string().optional(),
  METAAPI_REGION: z.string().optional(),

  MASTER_API_KEY: z.string().min(8),
  MASTER_API_SECRET: z.string().min(16),
  MASTER_EVENT_MAX_SKEW_SECONDS: z.coerce.number().int().positive().default(60),

  PAYMENT_PROVIDER: z.enum(["mock", "stripe", "omise"]).default("mock"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => getEnv().NODE_ENV === "production";
