import type { OrderType } from "@prisma/client";

export type RiskContext = {
  symbol: string;
  orderType: OrderType;
  volume: number;

  /** Member settings */
  allowedSymbols: string[];
  copyBuy: boolean;
  copySell: boolean;
  copyPendingOrders: boolean;
  maxOpenTrades: number;

  /** Risk profile: zero means the limit is disabled */
  maxDailyLoss: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxLotPerTrade: number;
  maxTotalLot: number;

  /** Live account state */
  openTrades: number;
  openVolume: number;
  equity: number;
  peakEquity: number;
  dailyStartEquity: number;
  dailyRealizedPnl: number;
  alreadyBreached: boolean;
};

export type RiskDecision =
  | { allowed: true }
  | { allowed: false; code: string; reason: string; shouldPause: boolean };

const PENDING_TYPES = new Set<OrderType>(["BUY_LIMIT", "SELL_LIMIT", "BUY_STOP", "SELL_STOP"]);

/**
 * Decides whether one order may be placed on one member account.
 *
 * Pure by design: it reads a snapshot and returns a decision, so it can be
 * unit-tested exhaustively and reused by both the copy worker and any
 * pre-trade check. `shouldPause` marks the breaches that should stop copying
 * altogether rather than skip a single trade.
 */
export function evaluateRisk(context: RiskContext): RiskDecision {
  if (context.alreadyBreached) {
    return {
      allowed: false,
      code: "RISK_LIMIT_REACHED",
      reason: "Copying is paused after an earlier risk breach",
      shouldPause: false,
    };
  }

  const isPending = PENDING_TYPES.has(context.orderType);
  if (isPending && !context.copyPendingOrders) {
    return { allowed: false, code: "SKIPPED", reason: "Pending orders are not copied", shouldPause: false };
  }

  const isBuy = context.orderType.startsWith("BUY");
  if (isBuy && !context.copyBuy) {
    return { allowed: false, code: "SKIPPED", reason: "Buy orders are not copied", shouldPause: false };
  }
  if (!isBuy && !context.copySell) {
    return { allowed: false, code: "SKIPPED", reason: "Sell orders are not copied", shouldPause: false };
  }

  // An empty list means every symbol is allowed.
  if (context.allowedSymbols.length > 0 && !context.allowedSymbols.includes(context.symbol.toUpperCase())) {
    return {
      allowed: false,
      code: "SKIPPED",
      reason: `${context.symbol} is not in the allowed symbol list`,
      shouldPause: false,
    };
  }

  if (context.openTrades >= context.maxOpenTrades) {
    return {
      allowed: false,
      code: "RISK_LIMIT_REACHED",
      reason: `Maximum of ${context.maxOpenTrades} open trades reached`,
      shouldPause: false,
    };
  }

  if (context.maxLotPerTrade > 0 && context.volume > context.maxLotPerTrade) {
    return {
      allowed: false,
      code: "RISK_LIMIT_REACHED",
      reason: `Volume ${context.volume} exceeds the ${context.maxLotPerTrade} lot per-trade limit`,
      shouldPause: false,
    };
  }

  if (context.maxTotalLot > 0 && context.openVolume + context.volume > context.maxTotalLot) {
    return {
      allowed: false,
      code: "RISK_LIMIT_REACHED",
      reason: `Total exposure would exceed the ${context.maxTotalLot} lot limit`,
      shouldPause: false,
    };
  }

  // --- account-level breaches: these stop copying, not just this trade -------

  const dailyLoss = context.dailyStartEquity - context.equity;
  if (context.maxDailyLoss > 0 && dailyLoss >= context.maxDailyLoss) {
    return {
      allowed: false,
      code: "RISK_LIMIT_REACHED",
      reason: `Daily loss ${dailyLoss.toFixed(2)} reached the ${context.maxDailyLoss} limit`,
      shouldPause: true,
    };
  }

  if (context.maxDailyLossPct > 0 && context.dailyStartEquity > 0) {
    const lossPct = (dailyLoss / context.dailyStartEquity) * 100;
    if (lossPct >= context.maxDailyLossPct) {
      return {
        allowed: false,
        code: "RISK_LIMIT_REACHED",
        reason: `Daily loss ${lossPct.toFixed(2)}% reached the ${context.maxDailyLossPct}% limit`,
        shouldPause: true,
      };
    }
  }

  if (context.maxDrawdownPct > 0 && context.peakEquity > 0) {
    const drawdownPct = ((context.peakEquity - context.equity) / context.peakEquity) * 100;
    if (drawdownPct >= context.maxDrawdownPct) {
      return {
        allowed: false,
        code: "RISK_LIMIT_REACHED",
        reason: `Drawdown ${drawdownPct.toFixed(2)}% reached the ${context.maxDrawdownPct}% limit`,
        shouldPause: true,
      };
    }
  }

  return { allowed: true };
}
