import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/crypto";
import { getTradeProvider } from "@/providers/trading/factory";
import { pollMasterAccount } from "@/services/master-watch.service";

/**
 * Publishing a strategy from a watched trading account, with no master EA.
 *
 * The dangerous failures here are not crashes. They are a poll that publishes
 * the same OPEN twice — doubling every follower's position — and a poll that
 * replays positions opened before anyone was following, entering them at a
 * price that has already moved. Both are covered below.
 */
const prisma = new PrismaClient();

let databaseAvailable = false;
const suffix = randomUUID().slice(0, 8);
const ids = { user: "", account: "", strategy: "", providerAccountId: "" };

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseAvailable = true;
  } catch {
    return;
  }

  const provider = getTradeProvider();
  const login = `91${suffix.slice(0, 6)}`;

  const connection = await provider.connectAccount({
    accountId: "pending",
    platform: "MT5",
    login,
    server: "Wtest-Server",
    broker: "Wtest Broker",
    password: "brokerpassword",
  });
  ids.providerAccountId = connection.providerAccountId;

  const user = await prisma.user.create({
    data: { email: `wtest-${suffix}@example.com`, passwordHash: await hashPassword("WatchTest123"), role: "MEMBER" },
  });
  ids.user = user.id;

  const account = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      label: "Master source",
      broker: "Wtest Broker",
      login,
      server: "Wtest-Server",
      platform: "MT5",
      provider: "mock",
      providerAccountId: connection.providerAccountId,
      encryptedPassword: encryptSecret("brokerpassword"),
      connectionStatus: "CONNECTED",
    },
  });
  ids.account = account.id;

  const strategy = await prisma.strategy.create({
    data: {
      code: `WTEST-${suffix}`.toUpperCase(),
      name: "Watched strategy",
      status: "ACTIVE",
      ownerType: "PLATFORM",
      masterPlatform: "MT5",
      masterAccountId: account.id,
    },
  });
  ids.strategy = strategy.id;
}, 60_000);

afterAll(async () => {
  if (databaseAvailable && ids.user) {
    await prisma.strategy.deleteMany({ where: { id: ids.strategy } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
  }
  await prisma.$disconnect();
});

describe("watching a master account", () => {
  it("records what is already open without copying it", async () => {
    if (!databaseAvailable) return;

    const provider = getTradeProvider();
    const existing = await provider.openPosition(ids.providerAccountId, {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.1,
      clientId: "pre-existing",
    });

    const first = await pollMasterAccount(ids.strategy);

    expect(first.baseline).toBe(true);
    expect(first.opened).toBe(0);

    // A follower cannot enter a trade that began before they were following it:
    // its price has already moved, and copying it now is a different trade.
    const events = await prisma.tradeEvent.count({ where: { strategyId: ids.strategy } });
    expect(events).toBe(0);

    // It is still recorded, so closing it later is recognised.
    const recorded = await prisma.masterTrade.findFirst({
      where: { strategyId: ids.strategy, ticket: existing.ticket! },
    });
    expect(recorded?.status).toBe("OPEN");
  }, 60_000);

  it("publishes an OPEN once, however many times it polls", async () => {
    if (!databaseAvailable) return;

    const provider = getTradeProvider();
    const opened = await provider.openPosition(ids.providerAccountId, {
      symbol: "EURUSD",
      orderType: "SELL",
      volume: 0.2,
      clientId: "watch-open",
    });

    const first = await pollMasterAccount(ids.strategy);
    expect(first.opened).toBe(1);

    // The same poll running twice — a retry, a restart, two workers — must not
    // publish it again: every follower would open a second position.
    const second = await pollMasterAccount(ids.strategy);
    expect(second.opened).toBe(0);

    const events = await prisma.tradeEvent.findMany({
      where: { strategyId: ids.strategy, ticket: opened.ticket!, eventType: "OPEN" },
    });
    expect(events).toHaveLength(1);
    expect(Number(events[0]!.volume)).toBeCloseTo(0.2, 2);
  }, 60_000);

  it("publishes a stop change once, and again only when it changes again", async () => {
    if (!databaseAvailable) return;

    const provider = getTradeProvider();
    const position = (await provider.getPositions(ids.providerAccountId)).find(
      (candidate) => candidate.symbol === "EURUSD",
    )!;

    await provider.modifyPosition(ids.providerAccountId, { ticket: position.ticket, sl: 1.1, tp: 1.05 });
    expect((await pollMasterAccount(ids.strategy)).modified).toBe(1);

    // Unchanged stops are not an event.
    expect((await pollMasterAccount(ids.strategy)).modified).toBe(0);

    await provider.modifyPosition(ids.providerAccountId, { ticket: position.ticket, sl: 1.09, tp: 1.05 });
    expect((await pollMasterAccount(ids.strategy)).modified).toBe(1);
  }, 60_000);

  it("publishes a partial close as the volume that was closed", async () => {
    if (!databaseAvailable) return;

    const provider = getTradeProvider();
    const position = (await provider.getPositions(ids.providerAccountId)).find(
      (candidate) => candidate.symbol === "EURUSD",
    )!;

    await provider.closePosition(ids.providerAccountId, { ticket: position.ticket, volume: 0.05 });

    const result = await pollMasterAccount(ids.strategy);
    expect(result.partiallyClosed).toBe(1);

    const event = await prisma.tradeEvent.findFirst({
      where: { strategyId: ids.strategy, eventType: "PARTIAL_CLOSE" },
      orderBy: { receivedAt: "desc" },
    });

    // The event carries what was closed, not what is left: the copy engine
    // turns that into the fraction each follower closes.
    expect(Number(event?.volume)).toBeCloseTo(0.05, 2);
    expect(Number(event?.closeFraction)).toBeCloseTo(0.25, 2);
  }, 60_000);

  it("publishes a close, with the broker's own realised profit", async () => {
    if (!databaseAvailable) return;

    const provider = getTradeProvider();
    const position = (await provider.getPositions(ids.providerAccountId)).find(
      (candidate) => candidate.symbol === "EURUSD",
    )!;

    await provider.closePosition(ids.providerAccountId, { ticket: position.ticket });

    const result = await pollMasterAccount(ids.strategy);
    expect(result.closed).toBe(1);

    const trade = await prisma.masterTrade.findFirst({
      where: { strategyId: ids.strategy, ticket: position.ticket },
    });
    expect(trade?.status).toBe("CLOSED");
    // Nothing is inferred from prices: the figure is the broker's own.
    expect(trade?.profit).not.toBeNull();

    // And closing it again is not a second event.
    expect((await pollMasterAccount(ids.strategy)).closed).toBe(0);
  }, 60_000);

  it("publishes nothing while the master account is disconnected", async () => {
    if (!databaseAvailable) return;

    await prisma.tradingAccount.update({
      where: { id: ids.account },
      data: { connectionStatus: "DISCONNECTED" },
    });

    const before = await prisma.tradeEvent.count({ where: { strategyId: ids.strategy } });
    const result = await pollMasterAccount(ids.strategy);
    const after = await prisma.tradeEvent.count({ where: { strategyId: ids.strategy } });

    // An unreachable account means unknown, not closed: publishing CLOSE for
    // every position because the broker is briefly unreachable would close
    // every follower's position for nothing.
    expect(result.closed).toBe(0);
    expect(after).toBe(before);

    await prisma.tradingAccount.update({
      where: { id: ids.account },
      data: { connectionStatus: "CONNECTED" },
    });
  }, 60_000);
});
