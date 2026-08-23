import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/crypto";
import { getTradeProvider } from "@/providers/trading/factory";
import { reconcileAccount, reconcileAllAccounts, recomputeStrategyStats } from "@/services/reconcile.service";

/**
 * Reconciliation: what the broker says, versus what we stored.
 *
 * Trade events only describe the master. A stop loss firing, a take profit
 * hitting or the member closing by hand happen at the broker with no event
 * reaching us, so these are the cases the sweep exists for.
 */
const prisma = new PrismaClient();

let databaseAvailable = false;
const suffix = randomUUID().slice(0, 8);
const ids = { user: "", account: "", strategy: "", subscription: "" };

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseAvailable = true;
  } catch {
    return;
  }

  const provider = getTradeProvider();
  const login = `61${suffix.slice(0, 6)}`;

  const connection = await provider.connectAccount({
    accountId: "pending",
    platform: "MT5",
    login,
    server: "Rtest-Server",
    broker: "Rtest Broker",
    password: "brokerpassword",
  });

  const user = await prisma.user.create({
    data: {
      email: `rtest-${suffix}@example.com`,
      passwordHash: await hashPassword("ReconcileTest123"),
      role: "MEMBER",
    },
  });
  ids.user = user.id;

  const account = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      label: "Reconcile test",
      broker: "Rtest Broker",
      login,
      server: "Rtest-Server",
      platform: "MT5",
      provider: "mock",
      providerAccountId: connection.providerAccountId,
      encryptedPassword: encryptSecret("brokerpassword"),
      brokerMinLot: connection.minLot,
      brokerMaxLot: connection.maxLot,
      brokerLotStep: connection.lotStep,
      balance: connection.balance,
      equity: connection.balance,
      peakEquity: connection.balance,
      connectionStatus: "CONNECTED",
      openTrades: 0,
    },
  });
  ids.account = account.id;

  const strategy = await prisma.strategy.create({
    data: {
      code: `RTEST-${suffix}`.toUpperCase(),
      name: "Reconcile strategy",
      status: "ACTIVE",
      ownerType: "PLATFORM",
    },
  });
  ids.strategy = strategy.id;

  const subscription = await prisma.strategySubscription.create({
    data: {
      userId: user.id,
      strategyId: strategy.id,
      accountId: account.id,
      status: "ACTIVE",
      copyStatus: "COPYING",
      copySettings: { create: {} },
      riskProfile: { create: {} },
    },
  });
  ids.subscription = subscription.id;
}, 60_000);

afterAll(async () => {
  if (databaseAvailable && ids.strategy) {
    await prisma.strategy.deleteMany({ where: { id: ids.strategy } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
  }
  await prisma.$disconnect();
});

describe("account reconciliation", () => {
  it("detects a position closed at the broker with no event", async () => {
    if (!databaseAvailable) return;

    const provider = getTradeProvider();
    const account = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: ids.account } });

    // Open a position and record the mapping, exactly as a copy would.
    const opened = await provider.openPosition(account.providerAccountId!, {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.1,
      clientId: "reconcile-test",
    });
    expect(opened.executed).toBe(true);

    await prisma.positionMapping.create({
      data: {
        subscriptionId: ids.subscription,
        accountId: ids.account,
        masterTicket: `master-${suffix}`,
        memberTicket: opened.ticket!,
        symbol: "XAUUSD",
        orderType: "BUY",
        volume: 0.1,
        openPrice: opened.price ?? 3345.2,
        status: "OPEN",
      },
    });

    const afterOpen = await reconcileAccount(ids.account);
    expect(afterOpen.openPositions).toBe(1);
    expect(afterOpen.closedMappings).toBe(0);

    // The member closes it themselves — nothing tells the platform.
    const closed = await provider.closePosition(account.providerAccountId!, { ticket: opened.ticket! });
    expect(closed.executed).toBe(true);

    const afterClose = await reconcileAccount(ids.account);

    expect(afterClose.closedMappings).toBe(1);
    expect(afterClose.openPositions).toBe(0);

    const mapping = await prisma.positionMapping.findFirst({
      where: { accountId: ids.account, memberTicket: opened.ticket! },
    });
    expect(mapping?.status).toBe("CLOSED");
    expect(mapping?.closedAt).toBeTruthy();

    // A position that ends at the broker is worth something, and only the
    // broker knows what: the sweep reads the realised price and profit back
    // rather than leaving the history to say a trade simply stopped existing.
    expect(mapping?.closePrice).not.toBeNull();
    expect(mapping?.profit).not.toBeNull();
    expect(mapping?.closeReason).toBeTruthy();

    // The broker is the authority on the open count, not our running total.
    const refreshed = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: ids.account } });
    expect(refreshed.openTrades).toBe(0);
    expect(refreshed.lastSyncAt).toBeTruthy();
  }, 60_000);

  it("marks an unreachable account ERROR and recovers it once it works again", async () => {
    if (!databaseAvailable) return;

    // A provider account id that was never connected stands in for a broker we
    // cannot reach.
    const original = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: ids.account } });
    await prisma.tradingAccount.update({
      where: { id: ids.account },
      data: { providerAccountId: "mock-mt5-does-not-exist", encryptedPassword: null },
    });

    await expect(reconcileAccount(ids.account)).rejects.toThrow();

    // Restoring the credentials lets the next sweep bring it back by itself,
    // rather than leaving the member to reconnect by hand.
    await prisma.tradingAccount.update({
      where: { id: ids.account },
      data: {
        connectionStatus: "ERROR",
        lastError: "simulated outage",
        providerAccountId: original.providerAccountId,
        encryptedPassword: original.encryptedPassword,
      },
    });

    const recovered = await reconcileAccount(ids.account);
    expect(recovered.openPositions).toBeGreaterThanOrEqual(0);

    const refreshed = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: ids.account } });
    expect(refreshed.connectionStatus).toBe("CONNECTED");
    expect(refreshed.lastError).toBeNull();
  }, 60_000);
});

describe("the sweep", () => {
  it("leaves an account that never connected alone, keeping the reason it failed", async () => {
    if (!databaseAvailable) return;

    // A connection attempt that failed before a provider session existed: the
    // account is ERROR, carries the broker's own reason, and has no session.
    const stranded = await prisma.tradingAccount.create({
      data: {
        userId: ids.user,
        label: "Never connected",
        broker: "Rtest Broker",
        login: `98${suffix.slice(0, 6)}`,
        server: "Rtest-Server",
        platform: "MT5",
        provider: "mock",
        connectionStatus: "ERROR",
        lastError: "MetaApi connection failed: broker refused the credentials",
      },
    });

    await reconcileAllAccounts();

    const refreshed = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: stranded.id } });

    // Sweeping it would replace that reason with "No stored provider session",
    // which says nothing about why the connection failed — and that message is
    // all the member and the logs have to go on.
    expect(refreshed.lastError).toBe("MetaApi connection failed: broker refused the credentials");

    await prisma.tradingAccount.delete({ where: { id: stranded.id } });
  }, 60_000);
});

describe("strategy statistics", () => {
  it("stays at zero while the master has reported no closed profit", async () => {
    if (!databaseAvailable) return;

    await prisma.masterTrade.create({
      data: {
        strategyId: ids.strategy,
        masterAccountCode: "MASTER-RTEST",
        ticket: `open-${suffix}`,
        symbol: "XAUUSD",
        orderType: "BUY",
        volume: 0.1,
        openPrice: 3345.2,
        status: "OPEN",
        openedAt: new Date(),
      },
    });

    const stats = await recomputeStrategyStats(ids.strategy);

    // One trade exists, but nothing is claimed about performance: a made-up
    // return is worse than none, because members choose a strategy by it.
    expect(stats.totalTrades).toBe(1);
    expect(stats.totalReturnPct).toBe(0);
    expect(stats.winRatePct).toBe(0);
  }, 30_000);

  it("computes return, win rate and drawdown from reported profits", async () => {
    if (!databaseAvailable) return;

    const trades = [
      { ticket: `w1-${suffix}`, profit: 12 },
      { ticket: `l1-${suffix}`, profit: -5 },
      { ticket: `w2-${suffix}`, profit: 8 },
    ];

    for (const [index, trade] of trades.entries()) {
      await prisma.masterTrade.create({
        data: {
          strategyId: ids.strategy,
          masterAccountCode: "MASTER-RTEST",
          ticket: trade.ticket,
          symbol: "XAUUSD",
          orderType: "BUY",
          volume: 0.1,
          openPrice: 3345.2,
          closePrice: 3350,
          profit: trade.profit,
          status: "CLOSED",
          openedAt: new Date(Date.now() - 60_000),
          // Closed in listed order: the drawdown depends on the sequence, so
          // the fixture has to be explicit about it.
          closedAt: new Date(Date.now() - (trades.length - index) * 1000),
        },
      });
    }

    const stats = await recomputeStrategyStats(ids.strategy);

    // +12, -5, +8 on a notional 100 => +15, two winners out of three.
    expect(stats.totalReturnPct).toBeCloseTo(15, 2);
    expect(stats.winRatePct).toBeCloseTo(66.67, 1);
    // Peak was 112 before the loss to 107: 4.46% drawdown.
    expect(stats.maxDrawdownPct).toBeCloseTo(4.46, 1);
    expect(stats.memberCount).toBe(1);

    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: ids.strategy } });
    expect(Number(strategy.totalReturnPct)).toBeCloseTo(15, 2);
  }, 30_000);
});
