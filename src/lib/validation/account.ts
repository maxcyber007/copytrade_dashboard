import { z } from "zod";

export const platformSchema = z.enum(["MT4", "MT5"]);

export const createAccountSchema = z.object({
  label: z.string().trim().min(2, "Give the account a name").max(40),
  platform: platformSchema,
  broker: z.string().trim().min(2, "Broker is required").max(60),
  login: z.string().trim().min(3, "Login is required").max(32).regex(/^[A-Za-z0-9_-]+$/, "Login contains invalid characters"),
  server: z.string().trim().min(2, "Server is required").max(80),
  accountType: z.enum(["DEMO", "LIVE"]).default("DEMO"),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  /** Sent once on creation, encrypted immediately, never returned. */
  password: z.string().min(4, "Password is required").max(128),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
