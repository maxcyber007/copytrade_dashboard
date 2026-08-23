import { describe, expect, it } from "vitest";
import { calculateLot, roundToStep, type LotInputs } from "@/services/risk/lot-calculator";

const base: LotInputs = {
  mode: "MULTIPLIER",
  masterVolume: 0.1,
  fixedLot: 0.01,
  multiplier: 1,
  balanceRatio: 1,
  riskPercent: 1,
  minLot: 0.01,
  maxLot: 10,
  brokerMinLot: 0.01,
  brokerMaxLot: 100,
  brokerLotStep: 0.01,
  memberBalance: 5000,
  memberEquity: 5000,
  masterBalance: 10_000,
  stopDistance: null,
  contractSize: 100,
};

const volumeOf = (input: Partial<LotInputs>) => {
  const result = calculateLot({ ...base, ...input });
  if (!result.ok) throw new Error(`expected a volume, got ${result.reason}`);
  return result.volume;
};

describe("rounding", () => {
  it("always rounds down to the broker step", () => {
    // Rounding up could push a member past their own maximum.
    expect(roundToStep(0.29, 0.1)).toBe(0.2);
    expect(roundToStep(0.077, 0.01)).toBe(0.07);
    expect(roundToStep(0.3, 0.1)).toBe(0.3);
  });
});

describe("lot modes", () => {
  it("FIXED ignores the master volume", () => {
    expect(volumeOf({ mode: "FIXED", fixedLot: 0.05, masterVolume: 2 })).toBe(0.05);
  });

  it("MULTIPLIER scales the master volume", () => {
    expect(volumeOf({ mode: "MULTIPLIER", multiplier: 2, masterVolume: 0.1 })).toBe(0.2);
    expect(volumeOf({ mode: "MULTIPLIER", multiplier: 0.1, masterVolume: 1 })).toBe(0.1);
  });

  it("BALANCE_RATIO scales by the balance ratio — the spec's example", () => {
    // Master $10,000 trading 0.10; member $5,000 -> 0.05
    expect(volumeOf({ mode: "BALANCE_RATIO", masterVolume: 0.1, memberBalance: 5000, masterBalance: 10_000 })).toBe(0.05);
  });

  it("BALANCE_RATIO refuses to guess without the master balance", () => {
    const result = calculateLot({ ...base, mode: "BALANCE_RATIO", masterBalance: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_MASTER_BALANCE");
  });

  it("RISK_PERCENT sizes from the stop distance", () => {
    // 1% of $5,000 = $50 risk; 7.00 points on XAUUSD at 100/lot = $700 per lot
    // -> 0.0714 lots, rounded down to the 0.01 step.
    expect(
      volumeOf({ mode: "RISK_PERCENT", riskPercent: 1, memberEquity: 5000, stopDistance: 7, contractSize: 100 }),
    ).toBe(0.07);
  });

  it("RISK_PERCENT refuses to size a trade with no stop", () => {
    const result = calculateLot({ ...base, mode: "RISK_PERCENT", stopDistance: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_STOP");
  });
});

describe("clamping", () => {
  it("clamps to the member's maximum", () => {
    expect(volumeOf({ multiplier: 100, maxLot: 2 })).toBe(2);
  });

  it("clamps to the broker's maximum even when the member allows more", () => {
    expect(volumeOf({ multiplier: 100, maxLot: 50, brokerMaxLot: 5 })).toBe(5);
  });

  it("raises a tiny volume to the floor rather than sending an unfillable order", () => {
    expect(volumeOf({ multiplier: 0.001, minLot: 0.01 })).toBe(0.01);
  });

  it("respects an MT4 broker's coarser lot step", () => {
    // 0.25 on a 0.1-step broker becomes 0.2, never 0.3.
    expect(volumeOf({ multiplier: 2.5, brokerLotStep: 0.1 })).toBe(0.2);
  });

  it("fails when rounding down leaves less than the broker minimum", () => {
    const result = calculateLot({ ...base, multiplier: 1, masterVolume: 0.1, brokerMinLot: 0.5, minLot: 0.01, maxLot: 0.4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_VOLUME");
  });

  it("reports when the result was clamped", () => {
    const result = calculateLot({ ...base, multiplier: 100, maxLot: 1 });
    expect(result.ok && result.clamped).toBe(true);
  });
});
