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

  // One provider serves both MT4 and MT5; the platform lives on the account.
  TRADING_PROVIDER: z.enum(["mock", "metaapi"]).default("mock"),
  METAAPI_TOKEN: z.string().optional(),
  METAAPI_REGION: z.string().optional(),

  MASTER_API_KEY: z.string().min(8),
  MASTER_API_SECRET: z.string().min(16),
  MASTER_EVENT_MAX_SKEW_SECONDS: z.coerce.number().int().positive().default(60),

  PAYMENT_PROVIDER: z.enum(["mock", "stripe", "omise"]).default("mock"),

  // Email: console prints to the log (development only), smtp actually sends.
  EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  EMAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Reset links expire quickly; a long-lived link is a standing key to an account. */
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  /** Background job cadence. */
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(60),
  STATS_INTERVAL_SECONDS: z.coerce.number().int().min(60).default(300),

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
