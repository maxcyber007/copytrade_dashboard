import { getEnv } from "@/lib/env";
import { AppError, ErrorCode } from "@/lib/errors";

/**
 * MetaApi billing balance.
 *
 * Deliberately not part of the trading provider abstraction: this is about our
 * own MetaApi account, not about a member's trading account, and it is not
 * something a different trading provider would ever have.
 *
 * The billing API lives on its own host and is not covered by the SDK, so it is
 * called directly. `advanceAmount` is returned by the API but is absent from
 * their published schema, so it is read defensively.
 */
const BILLING_HOST = "https://billing-api-v1.agiliumtrade.agiliumtrade.ai";

export type MetaApiBalance = {
  amount: number;
  trialAmount: number;
  advanceAmount: number;
};

export async function fetchMetaApiBalance(signal?: AbortSignal): Promise<MetaApiBalance> {
  const token = getEnv().METAAPI_TOKEN;
  if (!token) {
    throw new AppError(ErrorCode.PROVIDER_ERROR, "MetaApi is not configured");
  }

  const res = await fetch(`${BILLING_HOST}/users/current/balance`, {
    headers: { "auth-token": token },
    // This is live money data; a cached figure would be worse than none.
    cache: "no-store",
    signal,
  });

  if (!res.ok) {
    throw new AppError(
      ErrorCode.PROVIDER_ERROR,
      `MetaApi billing API returned ${res.status}`,
      { httpStatus: 502 },
    );
  }

  const body = (await res.json()) as Partial<Record<keyof MetaApiBalance, unknown>>;

  return {
    amount: toNumber(body.amount),
    trialAmount: toNumber(body.trialAmount),
    advanceAmount: toNumber(body.advanceAmount),
  };
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
