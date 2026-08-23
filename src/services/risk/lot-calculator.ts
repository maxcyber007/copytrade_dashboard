import type { LotMode } from "@prisma/client";

export type LotInputs = {
  mode: LotMode;
  masterVolume: number;
  /** Member settings */
  fixedLot: number;
  multiplier: number;
  balanceRatio: number;
  riskPercent: number;
  minLot: number;
  maxLot: number;
  /** Broker constraints, read from the account on connect */
  brokerMinLot: number;
  brokerMaxLot: number;
  brokerLotStep: number;
  /** Account context */
  memberBalance: number;
  memberEquity: number;
  masterBalance?: number | null;
  /** Required for RISK_PERCENT: distance from entry to stop, in price units */
  stopDistance?: number | null;
  /** Value of one price unit per lot (contract size), e.g. 100 for XAUUSD */
  contractSize?: number;
};

export type LotResult =
  | { ok: true; volume: number; rawVolume: number; clamped: boolean }
  | { ok: false; reason: string; code: "INVALID_VOLUME" | "MISSING_STOP" | "MISSING_MASTER_BALANCE" };

/**
 * Rounds down to the broker's lot step. Rounding up could exceed a member's
 * maximum, so the engine always rounds toward less exposure.
 */
export function roundToStep(volume: number, step: number): number {
  if (step <= 0) return Number(volume.toFixed(2));
  const steps = Math.floor((volume + 1e-9) / step);
  return Number((steps * step).toFixed(4));
}

/**
 * Translates a master volume into the member's volume.
 *
 * Every mode ends at the same place: clamp to the member's own bounds, then to
 * the broker's, then round down to the broker's step. A volume the broker
 * cannot fill is reported as an error rather than silently adjusted upward.
 */
export function calculateLot(input: LotInputs): LotResult {
  let raw: number;

  switch (input.mode) {
    case "FIXED":
      raw = input.fixedLot;
      break;

    case "MULTIPLIER":
      raw = input.masterVolume * input.multiplier;
      break;

    case "BALANCE_RATIO": {
      if (!input.masterBalance || input.masterBalance <= 0) {
        return {
          ok: false,
          code: "MISSING_MASTER_BALANCE",
          reason: "Master balance was not reported, so a proportional lot cannot be derived",
        };
      }
      raw = input.masterVolume * (input.memberBalance / input.masterBalance) * input.balanceRatio;
      break;
    }

    case "RISK_PERCENT": {
      // Sizing by risk requires a stop: without one the loss is unbounded and
      // any lot would be a guess.
      if (!input.stopDistance || input.stopDistance <= 0) {
        return {
          ok: false,
          code: "MISSING_STOP",
          reason: "Risk-percent sizing needs a stop loss on the master trade",
        };
      }
      const riskAmount = (input.memberEquity * input.riskPercent) / 100;
      const lossPerLot = input.stopDistance * (input.contractSize ?? 100_000);
      if (lossPerLot <= 0) {
        return { ok: false, code: "INVALID_VOLUME", reason: "Cannot derive loss per lot for this symbol" };
      }
      raw = riskAmount / lossPerLot;
      break;
    }

    default:
      raw = input.masterVolume;
  }

  if (!Number.isFinite(raw) || raw <= 0) {
    return { ok: false, code: "INVALID_VOLUME", reason: "Calculated volume is not a tradable size" };
  }

  const memberFloor = Math.max(input.minLot, input.brokerMinLot);
  const ceiling = Math.min(input.maxLot, input.brokerMaxLot);

  const bounded = Math.min(Math.max(raw, memberFloor), ceiling);
  const volume = roundToStep(bounded, input.brokerLotStep);

  // After rounding down, a volume below the broker minimum cannot be sent.
  if (volume < input.brokerMinLot) {
    return {
      ok: false,
      code: "INVALID_VOLUME",
      reason: `Calculated volume ${volume} is below the broker minimum ${input.brokerMinLot}`,
    };
  }

  return {
    ok: true,
    volume,
    rawVolume: Number(raw.toFixed(4)),
    clamped: Math.abs(volume - raw) > 1e-9,
  };
}
