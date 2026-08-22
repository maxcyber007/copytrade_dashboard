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

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
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
