import { prisma } from "@/lib/prisma";
import { fetchMetaApiBalance, type MetaApiBalance } from "@/lib/metaapi-billing";
import { logErrorEvent } from "@/lib/logger";
import { getEnv } from "@/lib/env";

/**
 * MetaApi consumption, assembled from two sources.
 *
 * MetaApi publishes a balance endpoint and nothing else — no usage report, no
 * billing date. So consumption is derived here:
 *
 *  - what is deployed right now comes from our own records, since we are the
 *    ones who deploy and undeploy accounts, and deployed accounts are what
 *    MetaApi charges for;
 *  - burn rate comes from comparing balance snapshots over time, which is
 *    measured rather than assuming a price per account that we would have to
 *    keep in step with their pricing page.
 */

/** Snapshots closer together than this add noise without adding information. */
const SNAPSHOT_MIN_GAP_MS = 5 * 60 * 1000;

/** Below this elapsed time the burn estimate is too noisy to show. */
const MIN_WINDOW_MS = 30 * 60 * 1000;

export type UsageBreakdown = { state: string; count: number };

/** A balance increase between snapshots — i.e. money was added. */
export type FundingEvent = { amount: number; balanceAfter: number; at: Date };

export type MetaApiUsage = {
  balance: MetaApiBalance | null;
  /** Set when the billing API could not be reached, so the UI can say so. */
  balanceError: string | null;
  deployedAccounts: number;
  breakdown: UsageBreakdown[];
  /** Currency units consumed per day, measured from snapshots. */
  burnPerDay: number | null;
  /** Days of balance left at the measured rate. */
  daysRemaining: number | null;
  /** Projected date the balance runs out. */
  projectedDepletion: Date | null;
  /** How long the burn measurement window is, in hours. */
  windowHours: number | null;
  /** True when the balance or the runway has fallen below the configured floor. */
  lowBalance: boolean;
  lowBalanceThreshold: number;
  lowRunwayDays: number;
  /** Top-ups inferred from the balance rising between snapshots. */
  funding: FundingEvent[];
  measuredAt: Date;
};

export async function getMetaApiUsage(): Promise<MetaApiUsage> {
  const measuredAt = new Date();

  const [balanceResult, grouped] = await Promise.all([
    fetchMetaApiBalance().then(
      (balance) => ({ balance, error: null as string | null }),
      (error: unknown) => {
        logErrorEvent({
          event: "METAAPI_BALANCE_FETCH_FAILED",
          reason: error instanceof Error ? error.message : "unknown",
        });
        return { balance: null, error: error instanceof Error ? error.message : "unknown" };
      },
    ),
    prisma.tradingAccount.groupBy({
      by: ["providerState"],
      _count: true,
      where: { providerAccountId: { not: null } },
    }),
  ]);

  const breakdown: UsageBreakdown[] = grouped.map((row) => ({
    state: row.providerState ?? "UNKNOWN",
    count: row._count,
  }));
  const deployedAccounts = breakdown.find((b) => b.state === "DEPLOYED")?.count ?? 0;

  if (balanceResult.balance) {
    await recordSnapshot(balanceResult.balance, deployedAccounts);
  }

  const burn = balanceResult.balance ? await measureBurn(balanceResult.balance.amount) : null;

  const env = getEnv();
  const lowBalanceThreshold = env.METAAPI_LOW_BALANCE;
  const lowRunwayDays = env.METAAPI_LOW_RUNWAY_DAYS;
  const lowBalance = Boolean(
    balanceResult.balance &&
      (balanceResult.balance.amount < lowBalanceThreshold ||
        (burn !== null && burn.daysRemaining < lowRunwayDays)),
  );

  return {
    balance: balanceResult.balance,
    balanceError: balanceResult.error,
    deployedAccounts,
    breakdown,
    burnPerDay: burn?.perDay ?? null,
    daysRemaining: burn?.daysRemaining ?? null,
    projectedDepletion: burn?.depletesAt ?? null,
    windowHours: burn?.windowHours ?? null,
    lowBalance,
    lowBalanceThreshold,
    lowRunwayDays,
    funding: await getFundingHistory(),
    measuredAt,
  };
}

async function recordSnapshot(balance: MetaApiBalance, deployedAccounts: number): Promise<void> {
  const latest = await prisma.metaApiBalanceSnapshot.findFirst({ orderBy: { recordedAt: "desc" } });
  if (latest && Date.now() - latest.recordedAt.getTime() < SNAPSHOT_MIN_GAP_MS) return;

  await prisma.metaApiBalanceSnapshot.create({
    data: {
      amount: balance.amount,
      trialAmount: balance.trialAmount,
      advanceAmount: balance.advanceAmount,
      deployedAccounts,
    },
  });
}

/**
 * Burn rate from the oldest snapshot still in the window to now.
 *
 * Returns null rather than a number whenever the data cannot support one: too
 * short a window, or a balance that went up because it was topped up. A
 * confident-looking runway built on one reading would be worse than none.
 */
async function measureBurn(
  currentAmount: number,
): Promise<{ perDay: number; daysRemaining: number; depletesAt: Date; windowHours: number } | null> {
  const oldest = await prisma.metaApiBalanceSnapshot.findFirst({ orderBy: { recordedAt: "asc" } });
  if (!oldest) return null;

  const elapsedMs = Date.now() - oldest.recordedAt.getTime();
  if (elapsedMs < MIN_WINDOW_MS) return null;

  const spent = Number(oldest.amount) - currentAmount;
  if (spent <= 0) return null; // topped up, or nothing consumed yet

  const perDay = (spent / elapsedMs) * 24 * 60 * 60 * 1000;
  if (perDay <= 0) return null;

  const daysRemaining = currentAmount / perDay;

  return {
    perDay,
    daysRemaining,
    depletesAt: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000),
    windowHours: elapsedMs / (60 * 60 * 1000),
  };
}

/**
 * Top-ups, inferred rather than recorded.
 *
 * MetaApi has no payment API and no deposit history endpoint, so funding is
 * detected from the only signal available: the balance rising between two
 * snapshots. It cannot see a top-up that happened while nothing was sampling,
 * which is why the dashboard presents these as detected rather than as an
 * authoritative statement of account.
 */
export async function getFundingHistory(limit = 10): Promise<FundingEvent[]> {
  const snapshots = await prisma.metaApiBalanceSnapshot.findMany({
    orderBy: { recordedAt: "asc" },
    select: { amount: true, recordedAt: true },
  });

  const events: FundingEvent[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const before = Number(snapshots[i - 1]!.amount);
    const after = Number(snapshots[i]!.amount);
    // A rise of a cent is rounding noise, not a deposit.
    if (after - before > 0.01) {
      events.push({ amount: after - before, balanceAfter: after, at: snapshots[i]!.recordedAt });
    }
  }

  return events.reverse().slice(0, limit);
}
