import { z } from "zod";
import { platformSchema } from "./account";

export const strategySchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Code is required")
    .max(40)
    .regex(/^[A-Z0-9-]+$/, "Use upper case letters, numbers and dashes, e.g. STRATEGY-001"),
  name: z.string().trim().min(3, "Name is required").max(60),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  masterPlatform: platformSchema.default("MT5"),
  masterAccountCode: z.string().trim().max(40).optional().or(z.literal("")),
  minPlanTier: z.enum(["FREE", "BASIC", "PRO", "PREMIUM"]).default("FREE"),
  isPublic: z.boolean().default(true),
});

export const strategyStatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "STOPPED", "ARCHIVED"]),
  /** Pausing a strategy: keep member positions open, or close them. */
  closeExistingPositions: z.boolean().default(false),
});

export type StrategyInput = z.infer<typeof strategySchema>;
export type StrategyStatusInput = z.infer<typeof strategyStatusSchema>;
