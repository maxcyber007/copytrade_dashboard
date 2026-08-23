import { z } from "zod";

export const orderTypeSchema = z.enum(["BUY", "SELL", "BUY_LIMIT", "SELL_LIMIT", "BUY_STOP", "SELL_STOP"]);

export const tradeEventTypeSchema = z.enum([
  "OPEN",
  "MODIFY",
  "CLOSE",
  "PARTIAL_CLOSE",
  "PENDING_ORDER",
  "DELETE_PENDING",
]);

/**
 * Payload published by a master EA. `strategyId` carries the strategy *code*
 * (STRATEGY-001), which is what an EA can be configured with; the API key
 * independently decides which strategy the event may be written to.
 */
export const masterEventSchema = z.object({
  strategyId: z.string().trim().min(1).max(40),
  eventId: z.string().trim().min(8, "eventId must be at least 8 characters").max(80),
  eventType: tradeEventTypeSchema,
  platform: z.enum(["MT4", "MT5"]).optional(),
  masterAccount: z.string().trim().min(1).max(40),
  ticket: z.string().trim().min(1).max(40),
  symbol: z.string().trim().min(1).max(20).toUpperCase(),
  orderType: orderTypeSchema,
  volume: z.coerce.number().positive().max(1000),
  price: z.coerce.number().nonnegative(),
  sl: z.coerce.number().nonnegative().nullable().optional(),
  tp: z.coerce.number().nonnegative().nullable().optional(),
  /** Realised profit on the master position, reported on CLOSE. */
  profit: z.coerce.number().nullable().optional(),
  /** Master account context, used for balance-ratio sizing. */
  masterBalance: z.coerce.number().nonnegative().nullable().optional(),
  masterEquity: z.coerce.number().nonnegative().nullable().optional(),
  timestamp: z.string().datetime({ offset: true }).or(z.string().datetime()),
});

export type MasterEventInput = z.infer<typeof masterEventSchema>;
