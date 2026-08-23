import { z } from "zod";

export const copySettingsSchema = z
  .object({
    lotMode: z.enum(["FIXED", "MULTIPLIER", "BALANCE_RATIO", "RISK_PERCENT"]).default("MULTIPLIER"),
    fixedLot: z.coerce.number().min(0.01).max(100).default(0.01),
    multiplier: z.coerce.number().min(0.01).max(100).default(1),
    balanceRatio: z.coerce.number().min(0.01).max(100).default(1),
    riskPercent: z.coerce.number().min(0.01).max(20).default(1),

    minLot: z.coerce.number().min(0.01).max(100).default(0.01),
    maxLot: z.coerce.number().min(0.01).max(100).default(10),

    copyBuy: z.boolean().default(true),
    copySell: z.boolean().default(true),
    copySl: z.boolean().default(true),
    copyTp: z.boolean().default(true),
    copyPendingOrders: z.boolean().default(false),
    reverseCopy: z.boolean().default(false),

    maxOpenTrades: z.coerce.number().int().min(1).max(200).default(20),
    slippagePoints: z.coerce.number().int().min(0).max(500).default(20),
    /** Empty means every symbol the master trades is allowed. */
    allowedSymbols: z.array(z.string().trim().toUpperCase().max(20)).max(50).default([]),
  })
  .refine((value) => value.minLot <= value.maxLot, {
    message: "Minimum lot cannot be greater than maximum lot",
    path: ["minLot"],
  });

export const riskProfileSchema = z.object({
  maxDailyLoss: z.coerce.number().min(0).max(1_000_000).default(0),
  maxDailyLossPct: z.coerce.number().min(0).max(100).default(0),
  maxDrawdownPct: z.coerce.number().min(0).max(100).default(0),
  maxLotPerTrade: z.coerce.number().min(0).max(100).default(0),
  maxTotalLot: z.coerce.number().min(0).max(1000).default(0),
  stopCopyOnBreach: z.boolean().default(true),
  closePositionsOnBreach: z.boolean().default(false),
});

export const subscribeSchema = z.object({
  strategyId: z.string().min(1),
  accountId: z.string().min(1),
  copySettings: copySettingsSchema.optional(),
  riskProfile: riskProfileSchema.optional(),
});

export const copyControlSchema = z.object({
  subscriptionId: z.string().min(1),
});

export type CopySettingsInput = z.infer<typeof copySettingsSchema>;
export type RiskProfileInput = z.infer<typeof riskProfileSchema>;
export type SubscribeInput = z.infer<typeof subscribeSchema>;
