import { prisma } from "@/lib/prisma";
import { accountRepository } from "@/repositories/account.repository";
import { copyTradeRepository } from "@/repositories/copy-trade.repository";
import { toNumber } from "@/lib/utils";

export type MemberOverview = {
  hasAccounts: boolean;
  balance: number;
  equity: number;
  floatingPnl: number;
  todayPnl: number;
  totalPnl: number;
  drawdownPct: number;
  openTrades: number;
  connectedAccounts: number;
  totalAccounts: number;
  copyingSubscriptions: number;
  lastSyncAt: Date | null;
  currency: string;
};

/**
 * Aggregates the member's own accounts. Figures come from cached account
 * metrics and recorded copy results — nothing is invented, so a member with no
 * connected account sees zeros behind an empty state rather than sample data.
 */
export async function getMemberOverview(userId: string): Promise<MemberOverview> {
  const [accounts, subscriptions, todayAggregate, totalAggregate] = await Promise.all([
    accountRepository.listForUser(userId),
    prisma.strategySubscription.count({ where: { userId, copyStatus: "COPYING" } }),
    prisma.copyTrade.aggregate({
      where: {
        account: { userId },
        status: "SUCCESS",
        createdAt: { gte: startOfToday() },
      },
      _sum: { profit: true },
    }),
    prisma.copyTrade.aggregate({
      where: { account: { userId }, status: "SUCCESS" },
      _sum: { profit: true },
    }),
  ]);

  const balance = sum(accounts, "balance");
  const equity = sum(accounts, "equity");
  // Peak is the sum of each account's own high-water mark, so it is comparable
  // with the summed equity. Comparing against a single account's peak would
  // report a negative drawdown as soon as a second account is added.
  const peak = Math.max(
    accounts.reduce((total, account) => total + Math.max(toNumber(account.peakEquity), toNumber(account.equity)), 0),
    equity,
  );
  const lastSync = accounts
    .map((account) => account.lastSyncAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    hasAccounts: accounts.length > 0,
    balance,
    equity,
    floatingPnl: sum(accounts, "floatingPnl"),
    todayPnl: toNumber(todayAggregate._sum.profit),
    totalPnl: toNumber(totalAggregate._sum.profit),
    // Drawdown from the highest equity seen across the member's accounts.
    drawdownPct: peak > 0 ? Number((((peak - equity) / peak) * 100).toFixed(2)) : 0,
    openTrades: accounts.reduce((total, account) => total + account.openTrades, 0),
    connectedAccounts: accounts.filter((account) => account.connectionStatus === "CONNECTED").length,
    totalAccounts: accounts.length,
    copyingSubscriptions: subscriptions,
    lastSyncAt: lastSync ?? null,
    currency: accounts[0]?.currency ?? "USD",
  };
}

export type AdminOverview = {
  totalMembers: number;
  activeMembers: number;
  totalAccounts: number;
  connectedAccounts: number;
  copyingAccounts: number;
  totalStrategies: number;
  activeStrategies: number;
  pendingProviders: number;
  approvedProviders: number;
  totalCopyTrades: number;
  successfulCopies: number;
  failedCopies: number;
  unresolvedErrors: number;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const [
    totalMembers,
    activeMembers,
    totalAccounts,
    connectionCounts,
    copyCounts,
    totalStrategies,
    activeStrategies,
    providerCounts,
    copyTradeCounts,
    unresolvedErrors,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "MEMBER" } }),
    prisma.user.count({ where: { role: "MEMBER", status: "ACTIVE" } }),
    prisma.tradingAccount.count(),
    accountRepository.countByConnectionStatus(),
    accountRepository.countByCopyStatus(),
    prisma.strategy.count(),
    prisma.strategy.count({ where: { status: "ACTIVE" } }),
    prisma.providerProfile.groupBy({ by: ["status"], _count: true }),
    copyTradeRepository.countByStatus(),
    prisma.systemError.count({ where: { resolvedAt: null } }),
  ]);

  const byKey = <T extends string>(rows: { _count: number }[], key: T, field: string) =>
    (rows as unknown as Record<string, unknown>[]).find((row) => row[field] === key)?._count ?? 0;

  return {
    totalMembers,
    activeMembers,
    totalAccounts,
    connectedAccounts: byKey(connectionCounts, "CONNECTED", "connectionStatus") as number,
    copyingAccounts: byKey(copyCounts, "COPYING", "copyStatus") as number,
    totalStrategies,
    activeStrategies,
    pendingProviders: byKey(providerCounts, "PENDING", "status") as number,
    approvedProviders: byKey(providerCounts, "APPROVED", "status") as number,
    totalCopyTrades: copyTradeCounts.reduce((total, row) => total + row._count, 0),
    successfulCopies: byKey(copyTradeCounts, "SUCCESS", "status") as number,
    failedCopies: byKey(copyTradeCounts, "FAILED", "status") as number,
    unresolvedErrors,
  };
}

export type MemberPerformance = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalProfit: number;
  averageProfit: number;
  averageLoss: number;
  profitFactor: number | null;
  averageLatencyMs: number | null;
  dailyProfit: { date: string; profit: number }[];
};

/** Performance is computed only from recorded copy results. */
export async function getMemberPerformance(userId: string): Promise<MemberPerformance> {
  const trades = await prisma.copyTrade.findMany({
    where: { account: { userId }, status: "SUCCESS", profit: { not: null } },
    select: { profit: true, latencyMs: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const profits = trades.map((trade) => toNumber(trade.profit));
  const wins = profits.filter((value) => value > 0);
  const losses = profits.filter((value) => value < 0);
  const grossProfit = wins.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(losses.reduce((total, value) => total + value, 0));
  const latencies = trades.map((trade) => trade.latencyMs).filter((value): value is number => value !== null);

  const daily = new Map<string, number>();
  for (const trade of trades) {
    const key = trade.createdAt.toISOString().slice(0, 10);
    daily.set(key, Number(((daily.get(key) ?? 0) + toNumber(trade.profit)).toFixed(2)));
  }

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length > 0 ? Number(((wins.length / trades.length) * 100).toFixed(2)) : 0,
    totalProfit: Number((grossProfit - grossLoss).toFixed(2)),
    averageProfit: wins.length > 0 ? Number((grossProfit / wins.length).toFixed(2)) : 0,
    averageLoss: losses.length > 0 ? Number((grossLoss / losses.length).toFixed(2)) : 0,
    // Undefined rather than Infinity when there are no losses yet.
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null,
    averageLatencyMs:
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    dailyProfit: [...daily.entries()].map(([date, profit]) => ({ date, profit })),
  };
}

function sum(accounts: { [key: string]: unknown }[], field: string): number {
  return Number(accounts.reduce((total, account) => total + toNumber(account[field]), 0).toFixed(2));
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
