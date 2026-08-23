import { describe, expect, it } from "vitest";
import { copySettingsSchema, riskProfileSchema, subscribeSchema } from "@/lib/validation/copy";
import { createAccountSchema } from "@/lib/validation/account";
import { strategySchema } from "@/lib/validation/strategy";

describe("copy settings", () => {
  it("defaults to a conservative multiplier setup", () => {
    const settings = copySettingsSchema.parse({});
    expect(settings.lotMode).toBe("MULTIPLIER");
    expect(settings.multiplier).toBe(1);
    expect(settings.copyPendingOrders).toBe(false);
    expect(settings.allowedSymbols).toEqual([]);
  });

  it("rejects a minimum lot above the maximum", () => {
    const result = copySettingsSchema.safeParse({ minLot: 5, maxLot: 1 });
    expect(result.success).toBe(false);
  });

  it("caps risk percent so one trade cannot risk the account", () => {
    expect(copySettingsSchema.safeParse({ lotMode: "RISK_PERCENT", riskPercent: 25 }).success).toBe(false);
    expect(copySettingsSchema.safeParse({ lotMode: "RISK_PERCENT", riskPercent: 2 }).success).toBe(true);
  });

  it("upper-cases allowed symbols so broker mapping compares consistently", () => {
    const settings = copySettingsSchema.parse({ allowedSymbols: ["xauusd", "eurusd"] });
    expect(settings.allowedSymbols).toEqual(["XAUUSD", "EURUSD"]);
  });

  it("defaults risk limits to disabled rather than to a guessed value", () => {
    const risk = riskProfileSchema.parse({});
    expect(risk.maxDailyLoss).toBe(0);
    expect(risk.maxDrawdownPct).toBe(0);
    expect(risk.stopCopyOnBreach).toBe(true);
  });

  it("requires both a strategy and an account to subscribe", () => {
    expect(subscribeSchema.safeParse({ strategyId: "s1" }).success).toBe(false);
    expect(subscribeSchema.safeParse({ strategyId: "s1", accountId: "a1" }).success).toBe(true);
  });
});

describe("account input", () => {
  it("accepts MT4 and MT5 only", () => {
    const base = {
      label: "Live",
      broker: "IC Markets",
      login: "12345678",
      server: "ICMarkets-Live02",
      password: "secret123",
    };
    expect(createAccountSchema.safeParse({ ...base, platform: "MT4" }).success).toBe(true);
    expect(createAccountSchema.safeParse({ ...base, platform: "MT5" }).success).toBe(true);
    expect(createAccountSchema.safeParse({ ...base, platform: "CTRADER" }).success).toBe(false);
  });

  it("rejects a login with characters a broker would never issue", () => {
    const result = createAccountSchema.safeParse({
      label: "Live",
      platform: "MT5",
      broker: "IC Markets",
      login: "123; DROP TABLE",
      server: "ICMarkets-Live02",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });
});

describe("strategy input", () => {
  it("enforces an upper-case code format", () => {
    const base = { name: "Gold Scalper" };
    expect(strategySchema.safeParse({ ...base, code: "STRATEGY-001" }).success).toBe(true);
    expect(strategySchema.safeParse({ ...base, code: "strategy 001" }).success).toBe(false);
  });
});
