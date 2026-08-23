import { describe, expect, it } from "vitest";
import { evaluateRisk, type RiskContext } from "@/services/risk/risk-engine";

const base: RiskContext = {
  symbol: "XAUUSD",
  orderType: "BUY",
  volume: 0.1,
  allowedSymbols: [],
  copyBuy: true,
  copySell: true,
  copyPendingOrders: false,
  maxOpenTrades: 10,
  maxDailyLoss: 0,
  maxDailyLossPct: 0,
  maxDrawdownPct: 0,
  maxLotPerTrade: 0,
  maxTotalLot: 0,
  openTrades: 0,
  openVolume: 0,
  equity: 10_000,
  peakEquity: 10_000,
  dailyStartEquity: 10_000,
  dailyRealizedPnl: 0,
  alreadyBreached: false,
};

const decide = (overrides: Partial<RiskContext>) => evaluateRisk({ ...base, ...overrides });

describe("direction and symbol filters", () => {
  it("allows a trade that passes every filter", () => {
    expect(decide({}).allowed).toBe(true);
  });

  it("skips buys or sells the member has turned off", () => {
    expect(decide({ copyBuy: false, orderType: "BUY" }).allowed).toBe(false);
    expect(decide({ copySell: false, orderType: "SELL" }).allowed).toBe(false);
    expect(decide({ copyBuy: false, orderType: "SELL" }).allowed).toBe(true);
  });

  it("skips pending orders unless the member opted in", () => {
    expect(decide({ orderType: "BUY_LIMIT" }).allowed).toBe(false);
    expect(decide({ orderType: "BUY_LIMIT", copyPendingOrders: true }).allowed).toBe(true);
  });

  it("treats an empty allow-list as every symbol allowed", () => {
    expect(decide({ allowedSymbols: [] }).allowed).toBe(true);
    expect(decide({ allowedSymbols: ["EURUSD"] }).allowed).toBe(false);
    expect(decide({ allowedSymbols: ["XAUUSD", "EURUSD"] }).allowed).toBe(true);
  });
});

describe("exposure limits", () => {
  it("stops at the maximum number of open trades", () => {
    expect(decide({ openTrades: 9, maxOpenTrades: 10 }).allowed).toBe(true);
    expect(decide({ openTrades: 10, maxOpenTrades: 10 }).allowed).toBe(false);
  });

  it("rejects a single trade above the per-trade lot limit", () => {
    expect(decide({ volume: 1, maxLotPerTrade: 0.5 }).allowed).toBe(false);
    expect(decide({ volume: 0.5, maxLotPerTrade: 0.5 }).allowed).toBe(true);
  });

  it("rejects a trade that would push total exposure over the limit", () => {
    expect(decide({ volume: 0.5, openVolume: 1.8, maxTotalLot: 2 }).allowed).toBe(false);
    expect(decide({ volume: 0.2, openVolume: 1.8, maxTotalLot: 2 }).allowed).toBe(true);
  });

  it("treats zero as disabled for every limit", () => {
    expect(decide({ volume: 500, maxLotPerTrade: 0, maxTotalLot: 0 }).allowed).toBe(true);
  });
});

describe("account breaches", () => {
  it("pauses copying when the daily loss limit is hit", () => {
    const decision = decide({ maxDailyLoss: 500, dailyStartEquity: 10_000, equity: 9_400 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.shouldPause).toBe(true);
      expect(decision.code).toBe("RISK_LIMIT_REACHED");
    }
  });

  it("pauses copying on a percentage daily loss", () => {
    const decision = decide({ maxDailyLossPct: 5, dailyStartEquity: 10_000, equity: 9_400 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.shouldPause).toBe(true);
  });

  it("pauses copying when drawdown from peak equity is breached", () => {
    const decision = decide({ maxDrawdownPct: 10, peakEquity: 12_000, equity: 10_500 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.shouldPause).toBe(true);
  });

  it("allows trading while still inside the drawdown limit", () => {
    expect(decide({ maxDrawdownPct: 20, peakEquity: 12_000, equity: 11_000 }).allowed).toBe(true);
  });

  it("keeps refusing once a breach has been recorded", () => {
    const decision = decide({ alreadyBreached: true });
    expect(decision.allowed).toBe(false);
    // The member resets the limit; the engine does not re-arm itself.
    if (!decision.allowed) expect(decision.shouldPause).toBe(false);
  });

  it("does not pause for a per-trade rejection", () => {
    const decision = decide({ volume: 5, maxLotPerTrade: 1 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.shouldPause).toBe(false);
  });
});
