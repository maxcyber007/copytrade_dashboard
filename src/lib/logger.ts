import pino from "pino";

const REDACTED = [
  "password",
  "passwordHash",
  "investorPassword",
  "encryptedPassword",
  "encryptedInvestor",
  "token",
  "accessToken",
  "apiKey",
  "apiSecret",
  "secret",
  "authorization",
  "cookie",
  "ENCRYPTION_KEY",
  "AUTH_SECRET",
  "MASTER_API_SECRET",
  "METAAPI_TOKEN",
];

const LEVELS = new Set(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

/**
 * The log level, defended twice.
 *
 * A deployment platform hands through a variable that was declared with no
 * value as an empty string, and `??` does not fall back on one — so
 * `process.env.LOG_LEVEL ?? "info"` yields `""`, which pino rejects. And it
 * rejects it by throwing at module scope, which takes down every route that
 * imports the logger; a typo in an environment variable should not be able to
 * do that either. So the value is checked against the levels that exist, and
 * anything else quietly becomes `info`.
 */
const configured = process.env.LOG_LEVEL?.trim();
const level = configured && LEVELS.has(configured) ? configured : "info";

export const logger = pino({
  level,
  redact: {
    paths: REDACTED.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
    censor: "[REDACTED]",
  },
  base: { service: "copytrade" },
});

export type StructuredEvent = {
  event: string;
  [key: string]: unknown;
};

export const logEvent = (e: StructuredEvent) => logger.info(e);
export const logErrorEvent = (e: StructuredEvent) => logger.error(e);
