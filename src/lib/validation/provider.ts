import { z } from "zod";

/** URL-safe handle used in /providers/:slug. */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export const providerApplicationSchema = z.object({
  displayName: z.string().trim().min(3, "Display name must be at least 3 characters").max(40),
  headline: z.string().trim().min(10, "Headline must be at least 10 characters").max(120),
  bio: z.string().trim().min(50, "Tell members at least 50 characters about your strategy").max(2000),
  website: z.string().trim().url("Enter a valid URL").max(255).optional().or(z.literal("")),
  country: z.string().trim().length(2, "Use a 2-letter country code").toUpperCase().optional().or(z.literal("")),
  yearsTrading: z.coerce.number().int().min(0).max(60).optional(),
  performanceFeePct: z.coerce.number().min(0).max(50).default(0),
  subscriptionPriceMonthly: z.coerce.number().min(0).max(10_000).default(0),
});

export const providerReviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "SUSPEND"]),
  /** Shown to the applicant. Required when the application is not approved. */
  publicReason: z.string().trim().max(500).optional(),
  /** Internal only, never returned to the applicant. */
  reviewNote: z.string().trim().max(1000).optional(),
});

export type ProviderApplicationInput = z.infer<typeof providerApplicationSchema>;
export type ProviderReviewInput = z.infer<typeof providerReviewSchema>;
