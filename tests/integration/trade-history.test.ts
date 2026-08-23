import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/crypto";
import { getTradeProvider } from "@/providers/trading/factory";
import { getAccountTradeHistory } from "@/services/trade-history.service";

/**
 * An account's trade history, from two sources that each know half of it.
 *
 * The broker knows every trade on the account, including ones the member placed
 * by hand, but nothing about strategies. The platform knows which position it
 * copied and for whom, but only for the ones it placed. Getting this wrong in
 * either direction is a real failure: a member's own trade attributed to a
 * strategy misrepresents that strategy's results, and a copied trade shown as
 * the member's hides what the platform did.
 */
const prisma = new PrismaClient();

let databaseAvailable = false;
const suffix = randomUUID().slice(0, 8);
const ids = { user: "", account: "", strategy: "", subscription: "", providerAccountId: "" };
const tickets = { copied: "", manual: "", open: "" };

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseAvailable = true;
  } catch {
    return;
  }

  const provider = getTradeProvider();
  const login = `81${suffix.slice(0, 6)}`;

  const connection = await provider.connectAccount({
    accountId: "pending",
    platform: "MT5",
    login,
    server: "Htest-Server",
    broker: "Htest Broker",
    password: "brokerpassword",
  });
  ids.providerAccountId = connection.providerAccountId;

  const user = await prisma.user.create({
    data: { email: `htest-${suffix}@example.com`, passwordHash: await hashPassword("HistoryTest123"), role: "MEMBER" },
  });
  ids.user = user.id;

  const account = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      label: "History test",
      broker: "Htest Broker",
      login,
      server: "Htest-Server",
      platform: "MT5",
      provider: "mock",
      providerAccountId: connection.providerAccountId,
      encryptedPassword: encryptSecret("brokerpassword"),
      connectionStatus: "CONNECTED",
    },
  });
  ids.account = account.id;

  const strategy = await prisma.strategy.create({
    data: { code: `HTEST-${suffix}`.toUpperCase(), name: "History strategy", status: "ACTIVE", ownerType: "PLATFORM" },
  });
  ids.strategy = strategy.id;

  const subscription = await prisma.strategySubscription.create({
    data: {
      userId: user.id,
      strategyId: strategy.id,
      accountId: account.id,
      status: "ACTIVE",
      copySettings: { create: {} },
      riskProfile: { create: {} },
    },
  });
  ids.subscription = subscription.id;

  // One trade the platform copied and closed.
  const copied = await provider.openPosition(connection.providerAccountId, {
    symbol: "XAUUSD",
    orderType: "BUY",
    volume: 0.05,
    clientId: "history-copied",
  });
  tickets.copied = copied.ticket!;

  await prisma.positionMapping.create({
    data: {
      subscriptionId: subscription.id,
      accountId: account.id,
      masterTicket: `master-${suffix}`,
      memberTicket: copied.ticket!,
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.05,
      openPrice: copied.price ?? 3345,
      status: "CLOSED",
      closedAt: new Date(),
    },
  });
  await provider.closePosition(connection.providerAccountId, { ticket: copied.ticket! });

  // One the member placed themselves: it exists only at the broker.
  const manual = await provider.openPosition(connection.providerAccountId, {
    symbol: "EURUSD",
    orderType: "SELL",
    volume: 0.1,
    clientId: "history-manual",
  });
  tickets.manual = manual.ticket!;
  await provider.closePosition(connection.providerAccountId, { ticket: manual.ticket! });

  // One copied position still open: the broker reports no closed trade for it.
  const open = await provider.openPosition(connection.providerAccountId, {
    symbol: "GBPUSD",
    orderType: "BUY",
    volume: 0.02,
    clientId: "history-open",
  });
  tickets.open = open.ticket!;

  await prisma.positionMapping.create({
    data: {
      subscriptionId: subscription.id,
      accountId: account.id,
      masterTicket: `master-open-${suffix}`,
      memberTicket: open.ticket!,
      symbol: "GBPUSD",
      orderType: "BUY",
      volume: 0.02,
      openPrice: open.price ?? 1.26,
      status: "OPEN",
    },
  });
}, 60_000);

afterAll(async () => {
  if (databaseAvailable && ids.user) {
    await prisma.strategy.deleteMany({ where: { id: ids.strategy } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
  }
  await prisma.$disconnect();
});

describe("an account's trade history", () => {
  it("shows the member's own trades alongside the copied ones, and says which is which", async () => {
    if (!databaseAvailable) return;

    const history = await getAccountTradeHistory(ids.account, ids.user);

    expect(history.brokerUnavailable).toBeNull();

    const copied = history.rows.find((row) => row.ticket === tickets.copied);
    const manual = history.rows.find((row) => row.ticket === tickets.manual);

    // The broker reported both; only one of them is the platform's doing.
    expect(copied?.copied).toBe(true);
    expect(copied?.strategyName).toBe("History strategy");

    expect(manual).toBeDefined();
    expect(manual?.copied).toBe(false);
    // Attributing a member's own trade to a strategy would misrepresent that
    // strategy's results to everyone else considering it.
    expect(manual?.strategyName).toBeUndefined();
    expect(manual?.symbol).toBe("EURUSD");
    expect(manual?.orderType).toBe("SELL");
  }, 60_000);

  it("keeps a still-open copied position, which the broker has no closed trade for", async () => {
    if (!databaseAvailable) return;

    const history = await getAccountTradeHistory(ids.account, ids.user);
    const open = history.rows.find((row) => row.ticket === tickets.open);

    expect(open?.closedAt).toBeNull();
    expect(open?.copied).toBe(true);
    // Open positions are not settled, so they cannot count towards a result.
    expect(history.totals.wins + history.totals.losses).toBeLessThan(history.rows.length);
  }, 60_000);

  it("still shows the copied positions when the broker cannot be reached", async () => {
    if (!databaseAvailable) return;

    await prisma.tradingAccount.update({
      where: { id: ids.account },
      data: { connectionStatus: "DISCONNECTED" },
    });

    const history = await getAccountTradeHistory(ids.account, ids.user);

    // A short history passed off as a complete one is worse than a stated gap.
    expect(history.brokerUnavailable).toBeTruthy();
    expect(history.rows.map((row) => row.ticket)).toContain(tickets.copied);
    expect(history.rows.map((row) => row.ticket)).not.toContain(tickets.manual);

    await prisma.tradingAccount.update({
      where: { id: ids.account },
      data: { connectionStatus: "CONNECTED" },
    });
  }, 60_000);

  it("refuses to hand one member another member's history", async () => {
    if (!databaseAvailable) return;
    await expect(getAccountTradeHistory(ids.account, "some-other-user")).rejects.toThrow(/not found/i);
  }, 30_000);
});
