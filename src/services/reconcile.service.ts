import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import { logErrorEvent, logEvent } from "@/lib/logger";
import { publishUserEvent } from "@/lib/events";
import { getTradeProvider } from "@/providers/trading/factory";
import { ensureProviderSession } from "./account.service";

export type AccountReconcileResult = {
  accountId: string;
  openPositions: number;
  closedMappings: number;
  equity: number;
};

/**
 * Brings one account's stored state back in line with the broker.
 *
 * Trade events tell us what the master did; they say nothing about what
 * happened to a member's own position afterwards. A stop loss firing, a take
 * profit hitting, or the member closing by hand all happen at the broker
 * without any event reaching us, so without this the dashboard drifts and the
 * copy engine's open-trade count is wrong.
 */
export async function reconcileAccount(accountId: string): Promise<AccountReconcileResult> {
  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, equity: true, peakEquity: true, connectionStatus: true, lastError: true },
  });

  if (!account || !["CONNECTED", "ERROR"].includes(account.connectionStatus)) {
    return { accountId, openPositions: 0, closedMappings: 0, equity: 0 };
  }

  const providerAccountId = await ensureProviderSession(accountId, { allowRecovery: true });
  const provider = getTradeProvider();

  const [info, positions] = await Promise.all([
    provider.getAccountInfo(providerAccountId),
    provider.getPositions(providerAccountId),
  ]);

  const liveTickets = new Set(positions.map((position) => position.ticket));

  // Mappings we believe are open but the broker no longer reports were closed
  // outside the platform. They are marked closed here, not guessed at later.
  const openMappings = await prisma.positionMapping.findMany({
    where: { accountId, status: { in: ["OPEN", "PARTIALLY_CLOSED"] } },
    select: { id: true, memberTicket: true, masterTicket: true },
  });

  const vanished = openMappings.filter((mapping) => !liveTickets.has(mapping.memberTicket));

  for (const mapping of vanished) {
    // A stop loss, a take profit or the member closing by hand leaves no event
    // and no result of its own. The broker's deal records are the only place
    // the fill price and realised profit exist, so they are read back here —
    // when the lookup returns nothing, the figures stay null and the history
    // shows a dash rather than a number this platform invented.
    const result = await provider
      .getClosedPosition(providerAccountId, mapping.memberTicket)
      .catch(() => null);

    await prisma.positionMapping.update({
      where: { id: mapping.id },
      data: {
        status: "CLOSED",
        closedAt: result?.closedAt ?? new Date(),
        closePrice: result?.closePrice ?? null,
        profit: result?.profit ?? null,
        closeReason: result?.reason ?? null,
      },
    });
  }

  if (vanished.length > 0) {
    logEvent({
      event: "POSITIONS_CLOSED_AT_BROKER",
      accountId,
      count: vanished.length,
      tickets: vanished.map((mapping) => mapping.memberTicket),
    });
  }

  // Deals can lag the close by a moment, so a lookup at close time can come
  // back empty. Recently closed positions still missing a figure are retried
  // here, bounded so a sweep never turns into a history crawl.
  const missingResult = await prisma.positionMapping.findMany({
    where: {
      accountId,
      status: "CLOSED",
      profit: null,
      closedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, memberTicket: true },
    orderBy: { closedAt: "desc" },
    take: 20,
  });

  let backfilled = 0;

  for (const mapping of missingResult) {
    const result = await provider.getClosedPosition(providerAccountId, mapping.memberTicket).catch(() => null);
    if (!result) continue;

    await prisma.positionMapping.update({
      where: { id: mapping.id },
      data: {
        closePrice: result.closePrice ?? null,
        profit: result.profit,
        closeReason: result.reason ?? undefined,
      },
    });
    backfilled += 1;
  }

  if (backfilled > 0) {
    logEvent({ event: "POSITION_RESULTS_BACKFILLED", accountId, count: backfilled });
  }

  const peakEquity = Math.max(toNumber(account.peakEquity), info.equity);

  await prisma.tradingAccount.update({
    where: { id: accountId },
    data: {
      balance: info.balance,
      equity: info.equity,
      margin: info.margin,
      freeMargin: info.freeMargin,
      floatingPnl: Number((info.equity - info.balance).toFixed(2)),
      peakEquity,
      // The broker is the authority on how many positions are open.
      openTrades: positions.length,
      lastSyncAt: new Date(),
      // Reaching the broker again clears an earlier failure.
      ...(account.connectionStatus === "ERROR" || account.lastError
        ? { connectionStatus: "CONNECTED" as const, lastError: null, lastErrorCode: null }
        : {}),
    },
  });

  if (account.connectionStatus === "ERROR") {
    logEvent({ event: "ACCOUNT_RECOVERED", accountId });
  }

  if (vanished.length > 0 || Math.abs(toNumber(account.equity) - info.equity) > 0.005) {
    await publishUserEvent(account.userId, {
      type: "ACCOUNT_UPDATED",
      accountId,
      at: new Date().toISOString(),
    });
  }

  return {
    accountId,
    openPositions: positions.length,
    closedMappings: vanished.length,
    equity: info.equity,
  };
}

/**
 * Reconciles every connected account. One failure never stops the others.
 *
 * `accountIds` narrows the sweep to specific accounts — used to retry a known
 * set, and by tests, which must not reach across into data they do not own.
 */
export async function reconcileAllAccounts(
  scope: { accountIds?: string[] } = {},
): Promise<{ accounts: number; failed: number; closed: number }> {
  // ERROR accounts are included so a broker outage or a restart heals itself
  // once the account is reachable again. An account that never connected is
  // not: there is no session to restore, and marking it ERROR here would
  // overwrite the reason its connection attempt actually failed — which is the
  // one thing the member and the logs need to see.
  const accounts = await prisma.tradingAccount.findMany({
    where: {
      connectionStatus: { in: ["CONNECTED", "ERROR"] },
      providerAccountId: { not: null },
      encryptedPassword: { not: null },
      ...(scope.accountIds ? { id: { in: scope.accountIds } } : {}),
    },
    select: { id: true },
  });

  let failed = 0;
  let closed = 0;

  for (const account of accounts) {
    try {
      const result = await reconcileAccount(account.id);
      closed += result.closedMappings;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "unknown";
      logErrorEvent({ event: "ACCOUNT_RECONCILE_FAILED", accountId: account.id, reason: message });

      // An account we cannot reach must say so. Leaving it CONNECTED would
      // show the member stale numbers and make the copy engine attempt an
      // order on it for every master event.
      await prisma.tradingAccount
        .update({
          where: { id: account.id },
          data: { connectionStatus: "ERROR", lastError: message },
        })
        .catch(() => undefined);
    }
  }

  return { accounts: accounts.length, failed, closed };
}

export type StrategyStats = {
  strategyId: string;
  totalTrades: number;
  winRatePct: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  memberCount: number;
};

/**
 * Recomputes the figures shown in the marketplace from closed master trades.
 *
 * Only trades whose profit the master EA actually reported are counted. Nothing
 * is inferred from open and close prices — contract size, swap and commission
 * are not ours to guess, and a wrong return figure is worse than none, because
 * members choose a strategy by it.
 */
export async function recomputeStrategyStats(strategyId: string): Promise<StrategyStats> {
  const [closedTrades, allTrades, memberCount] = await Promise.all([
    prisma.masterTrade.findMany({
      where: { strategyId, status: "CLOSED", profit: { not: null } },
      select: { profit: true, closedAt: true },
      orderBy: { closedAt: "asc" },
    }),
    prisma.masterTrade.count({ where: { strategyId } }),
    prisma.strategySubscription.count({ where: { strategyId, status: "ACTIVE" } }),
  ]);

  const profits = closedTrades.map((trade) => toNumber(trade.profit));
  const wins = profits.filter((value) => value > 0).length;

  // Equity curve from a notional 100, so the return is comparable between
  // strategies without publishing the master's balance.
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;

  for (const profit of profits) {
    equity += profit;
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  }

  const stats: StrategyStats = {
    strategyId,
    totalTrades: allTrades,
    winRatePct: profits.length > 0 ? Number(((wins / profits.length) * 100).toFixed(2)) : 0,
    totalReturnPct: profits.length > 0 ? Number((equity - 100).toFixed(2)) : 0,
    maxDrawdownPct: Number(maxDrawdown.toFixed(2)),
    memberCount,
  };

  await prisma.strategy.update({
    where: { id: strategyId },
    data: {
      totalTrades: stats.totalTrades,
      winRatePct: stats.winRatePct,
      totalReturnPct: stats.totalReturnPct,
      maxDrawdownPct: stats.maxDrawdownPct,
      memberCount: stats.memberCount,
    },
  });

  return stats;
}

/** Recomputes every strategy, then the provider aggregates that depend on them. */
export async function recomputeAllStats(): Promise<{ strategies: number; providers: number }> {
  const strategies = await prisma.strategy.findMany({ select: { id: true } });

  for (const strategy of strategies) {
    try {
      await recomputeStrategyStats(strategy.id);
    } catch (error) {
      logErrorEvent({
        event: "STRATEGY_STATS_FAILED",
        strategyId: strategy.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const providers = await prisma.providerProfile.findMany({ select: { id: true } });

  for (const provider of providers) {
    const [totalStrategies, subscriberRows] = await Promise.all([
      prisma.strategy.count({ where: { providerId: provider.id } }),
      prisma.strategySubscription.findMany({
        where: { strategy: { providerId: provider.id }, status: "ACTIVE" },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

    await prisma.providerProfile.update({
      where: { id: provider.id },
      // Distinct members, so one person following two of a provider's
      // strategies is one subscriber rather than two.
      data: { totalStrategies, totalSubscribers: subscriberRows.length },
    });
  }

  return { strategies: strategies.length, providers: providers.length };
}
