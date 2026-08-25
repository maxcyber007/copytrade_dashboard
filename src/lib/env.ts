import { z } from "zod";
import { appRole } from "@/lib/runtime-config";

/**
 * Central, validated access to environment variables.
 * Never import process.env directly outside of this module.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  /**
   * Where a member's browser goes.
   *
   * `APP_URL` is this deployment's own address, which on a split backend is the
   * API — not somewhere a person can open. Links that travel to a member, a
   * password reset above all, have to point at the frontend instead. Defaults
   * to `APP_URL`, so a single-host install needs nothing.
   */
  PUBLIC_APP_URL: z.string().url().optional(),

  /** See `@/lib/runtime-config` — validated here so a typo fails at startup. */
  APP_ROLE: z.enum(["all", "api", "frontend"]).default("all"),
  /** Where server-rendered pages reach the API. Defaults to APP_URL. */
  API_BASE_URL: z.string().url().optional(),
  /**
   * Browser origins allowed to call this API with credentials, comma-separated.
   * Required once the frontend lives on another domain; empty means same-origin
   * only, which is what a single-host deployment wants.
   */
  ALLOWED_ORIGINS: z.string().default(""),
  /**
   * Domain the session cookie is issued for, e.g. `.trendxsynex.com`, so that
   * `app.` and `api.` on that domain share one session. Unset issues a
   * host-only cookie, which is correct for a single-host deployment.
   */
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  /**
   * `lax` is safe while the frontend and API are on the same site — subdomains
   * of one registrable domain count as same-site, so `app.` calling `api.`
   * still sends the cookie. Only a genuinely cross-site frontend (a
   * `*.vercel.app` preview, say) needs `none`, and `none` demands Secure.
   */
  SESSION_COOKIE_SAMESITE: z.enum(["lax", "none", "strict"]).default("lax"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),

  ENCRYPTION_KEY: z.string().min(1),

  // One provider serves both MT4 and MT5; the platform lives on the account.
  TRADING_PROVIDER: z.enum(["mock", "metaapi"]).default("mock"),
  METAAPI_TOKEN: z.string().optional(),
  /** Region for accounts this platform creates; existing accounts keep theirs. */
  METAAPI_REGION: z.string().optional(),
  /** `cloud-g2` is MetaApi's documented default: faster and cheaper than G1. */
  METAAPI_ACCOUNT_TYPE: z.enum(["cloud-g2", "cloud-g1"]).default("cloud-g2"),
  /** `high` is a paid MetaApi option billed at two resource slots. */
  METAAPI_RELIABILITY: z.enum(["regular", "high"]).default("regular"),
  /**
   * Balance below which the admin dashboard warns. MetaApi drains prepaid
   * credit and simply stops serving accounts when it runs out, so the warning
   * has to arrive well before zero.
   */
  METAAPI_LOW_BALANCE: z.coerce.number().nonnegative().default(20),
  /** Runway below which the dashboard warns, in days. */
  METAAPI_LOW_RUNWAY_DAYS: z.coerce.number().positive().default(7),

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
  /**
   * How often a watched master account is polled. This is the delay a follower
   * sees before a master's trade reaches them, so it is deliberately short —
   * and bounded below, because each poll is a broker call per strategy.
   */
  MASTER_WATCH_SECONDS: z.coerce.number().int().min(5).max(300).default(15),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
}).superRefine((env, ctx) => {
  // `SameSite=None` is ignored by browsers unless the cookie is also Secure, so
  // the session would silently stop being sent. Fail here instead.
  if (env.SESSION_COOKIE_SAMESITE === "none" && env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
    ctx.addIssue({
      code: "custom",
      path: ["SESSION_COOKIE_SAMESITE"],
      message: "requires HTTPS — browsers drop SameSite=None cookies that are not Secure",
    });
  }

  // A split frontend cannot reach the API without being told where it is, and
  // the API cannot answer it without being told to allow its origin.
  if (env.APP_ROLE === "api" && env.ALLOWED_ORIGINS.trim() === "") {
    ctx.addIssue({
      code: "custom",
      path: ["ALLOWED_ORIGINS"],
      message: "required when APP_ROLE=api — list the frontend origins, e.g. https://app.example.com",
    });
  }

  // A backend-only deployment serves no pages, so falling back to APP_URL would
  // put its own address into every password reset email — a link that lands on
  // a 404. Refusing to start says so, rather than letting members discover it.
  if (env.APP_ROLE === "api" && !env.PUBLIC_APP_URL) {
    ctx.addIssue({
      code: "custom",
      path: ["PUBLIC_APP_URL"],
      message:
        "required when APP_ROLE=api — the address members open in a browser, e.g. https://app.example.com. " +
        "Emailed links are built from it, and APP_URL points at the API here.",
    });
  }

  // A missing token would otherwise surface as "the trading provider reported
  // an error" the first time a member presses Connect. A configuration mistake
  // belongs at startup, where whoever made it is looking.
  if (env.TRADING_PROVIDER === "metaapi" && !env.METAAPI_TOKEN) {
    ctx.addIssue({
      code: "custom",
      path: ["METAAPI_TOKEN"],
      message: "required when TRADING_PROVIDER=metaapi — set it to your MetaApi API token",
    });
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Backend configuration: database, queues, provider tokens, signing secrets.
 *
 * Only the API deployment holds these. Reaching this from a frontend-role
 * deployment means server-only code was pulled into the page bundle, which is
 * a build mistake worth failing loudly rather than a missing variable to paper
 * over — the frontend is supposed to hold no secrets at all.
 */
export function getEnv(): Env {
  if (cached) return cached;
  if (appRole() === "frontend") {
    throw new Error(
      "getEnv() was called on a frontend deployment (APP_ROLE=frontend). " +
        "Backend configuration does not exist here — read data through @/lib/api instead.",
    );
  }
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

/**
 * The address to put in something a member will click.
 *
 * Never `APP_URL` directly: on a split deployment that is the API's address,
 * and a member opening it gets a 404.
 */
export function publicAppUrl(): string {
  const env = getEnv();
  return (env.PUBLIC_APP_URL ?? env.APP_URL).replace(/\/+$/, "");
}
