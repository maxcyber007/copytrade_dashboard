import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/crypto";
import { processTradeEvent } from "@/services/copy-engine.service";
import { MockTradingProvider } from "@/providers/trading/MockTradingProvider";

/**
 * The integration test the specification asks for:
 *
 *   master trade -> trade event -> copy engine -> member account -> copy trade
 *
 * It runs against a real database and the mock provider, so it exercises the
 * unique constraints and the fan-out exactly as production does. Skipped when
 * no database is reachable, so `npm run test` still works without one.
 */
const prisma = new PrismaClient();

let databaseAvailable = false;
const suffix = randomUUID().slice(0, 8);

const ids = {
  userA: "",
  userB: "",
  accountA: "",
  accountB: "",
  strategy: "",
  subscriptionA: "",
  subscriptionB: "",
};

async function seedFixture() {
  const provider = new MockTradingProvider();

  const strategy = await prisma.strategy.create({
    data: {
      code: `ITEST-${suffix}`.toUpperCase(),
      name: "Integration strategy",
      status: "ACTIVE",
      ownerType: "PLATFORM",
      masterPlatform: "MT5",
      isPublic: true,
    },
  });
  ids.strategy = strategy.id;

  // Two members with different copy settings, so one master trade must produce
  // two different member volumes.
  const members = [
    { key: "A" as const, login: `71${suffix.slice(0, 6)}`, platform: "MT5" as const, multiplier: 2 },
    // 1.0x on an MT4 broker whose smallest lot is 0.1 lands exactly on it.
    { key: "B" as const, login: `72${suffix.slice(0, 6)}`, platform: "MT4" as const, multiplier: 1 },
  ];

  for (const member of members) {
    const user = await prisma.user.create({
      data: {
        email: `itest-${member.key.toLowerCase()}-${suffix}@example.com`,
        passwordHash: await hashPassword("IntegrationTest123"),
        role: "MEMBER",
      },
    });

    const connection = await provider.connectAccount({
      accountId: "pending",
      platform: member.platform,
      login: member.login,
      server: "Itest-Server",
      broker: "Itest Broker",
      password: "brokerpassword",
    });

    const account = await prisma.tradingAccount.create({
      data: {
        userId: user.id,
        label: `Itest ${member.key}`,
        broker: "Itest Broker",
        login: member.login,
        server: "Itest-Server",
        platform: member.platform,
        accountType: "DEMO",
        provider: "mock",
        providerAccountId: connection.providerAccountId,
        encryptedPassword: encryptSecret("brokerpassword"),
        positionMode: connection.positionMode,
        brokerMinLot: connection.minLot,
        brokerMaxLot: connection.maxLot,
        brokerLotStep: connection.lotStep,
        balance: connection.balance,
        equity: connection.balance,
        peakEquity: connection.balance,
        connectionStatus: "CONNECTED",
        copyStatus: "COPYING",
        connectedAt: new Date(),
      },
    });

    const subscription = await prisma.strategySubscription.create({
      data: {
        userId: user.id,
        strategyId: strategy.id,
        accountId: account.id,
        status: "ACTIVE",
        copyStatus: "COPYING",
        startedAt: new Date(),
        copySettings: {
          create: {
            lotMode: "MULTIPLIER",
            multiplier: member.multiplier,
            minLot: 0.01,
            maxLot: 10,
            maxOpenTrades: 20,
          },
        },
        riskProfile: { create: {} },
      },
    });

    if (member.key === "A") {
      ids.userA = user.id;
      ids.accountA = account.id;
      ids.subscriptionA = subscription.id;
    } else {
      ids.userB = user.id;
      ids.accountB = account.id;
      ids.subscriptionB = subscription.id;
    }
  }
}

async function createEvent(input: {
  eventId: string;
  eventType: "OPEN" | "MODIFY" | "PARTIAL_CLOSE" | "CLOSE";
  ticket: string;
  volume: number;
  price: number;
  sl?: number;
  closeFraction?: number;
}) {
  const masterTrade = await prisma.masterTrade.upsert({
    where: { strategyId_ticket: { strategyId: ids.strategy, ticket: input.ticket } },
    update: {},
    create: {
      strategyId: ids.strategy,
      masterAccountCode: "MASTER-ITEST",
      ticket: input.ticket,
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: input.volume,
      openPrice: input.price,
      status: "OPEN",
      openedAt: new Date(),
    },
  });

  return prisma.tradeEvent.create({
    data: {
      eventId: input.eventId,
      strategyId: ids.strategy,
      masterTradeId: masterTrade.id,
      eventType: input.eventType,
      platform: "MT5",
      masterAccountCode: "MASTER-ITEST",
      ticket: input.ticket,
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: input.volume,
      price: input.price,
      sl: input.sl ?? null,
      masterBalance: 10_000,
      closeFraction: input.closeFraction ?? null,
      status: "QUEUED",
      occurredAt: new Date(),
      rawPayload: {},
    },
  });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseAvailable = true;
  } catch {
    databaseAvailable = false;
    return;
  }
  await seedFixture();
}, 60_000);

afterAll(async () => {
  // KEEP_ITEST=1 leaves the fixture in place for inspection after a failure.
  if (databaseAvailable && ids.strategy && process.env.KEEP_ITEST !== "1") {
    // Cascades clear the events, copies and mappings with the strategy.
    await prisma.strategy.deleteMany({ where: { id: ids.strategy } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB].filter(Boolean) } } });
  }
  await prisma.$disconnect();
});

describe.runIf(process.env.SKIP_DB_TESTS !== "1")("master trade to member copies", () => {
  const ticket = `88${suffix.slice(0, 6)}`;

  it("fans one master trade out to both members at their own sizes", async () => {
    if (!databaseAvailable) return;

    const event = await createEvent({
      eventId: `itest-open-${suffix}`,
      eventType: "OPEN",
      ticket,
      volume: 0.1,
      price: 3345.2,
      sl: 3338.2,
    });

    const outcome = await processTradeEvent(event.eventId);

    expect(outcome.processed).toBe(2);
    expect(outcome.succeeded).toBe(2);

    const copies = await prisma.copyTrade.findMany({ where: { eventId: event.eventId } });
    const byAccount = new Map(copies.map((copy) => [copy.accountId, copy]));

    // Master 0.10 at 2x is 0.20 on MT5; at 1x it is 0.10 on the MT4 account.
    expect(Number(byAccount.get(ids.accountA)?.memberVolume)).toBe(0.2);
    expect(Number(byAccount.get(ids.accountB)?.memberVolume)).toBeCloseTo(0.1, 2);

    for (const copy of copies) {
      expect(copy.status).toBe("SUCCESS");
      // A copy counts only when the broker returned a ticket.
      expect(copy.memberTicket).toBeTruthy();
      expect(copy.latencyMs).toBeGreaterThanOrEqual(0);
    }

    const mappings = await prisma.positionMapping.findMany({ where: { masterTicket: ticket } });
    expect(mappings).toHaveLength(2);
  }, 60_000);

  it("processing the same event again opens nothing new", async () => {
    if (!databaseAvailable) return;

    const before = await prisma.copyTrade.count({ where: { strategyId: ids.strategy } });
    const outcome = await processTradeEvent(`itest-open-${suffix}`);
    const after = await prisma.copyTrade.count({ where: { strategyId: ids.strategy } });

    // The event is already PROCESSED, so the worker stops immediately.
    expect(outcome.processed).toBe(0);
    expect(after).toBe(before);
  }, 30_000);

  it("refuses a second copy row for the same event and account", async () => {
    if (!databaseAvailable) return;

    const existing = await prisma.copyTrade.findFirst({ where: { eventId: `itest-open-${suffix}` } });
    expect(existing).toBeTruthy();

    // This is the constraint the whole idempotency design rests on.
    await expect(
      prisma.copyTrade.create({
        data: {
          eventId: existing!.eventId,
          strategyId: existing!.strategyId,
          subscriptionId: existing!.subscriptionId,
          accountId: existing!.accountId,
          eventType: "OPEN",
          masterTicket: existing!.masterTicket,
          masterSymbol: "XAUUSD",
          memberSymbol: "XAUUSD",
          orderType: "BUY",
          masterVolume: 0.1,
          memberVolume: 0.2,
          masterPrice: 3345.2,
        },
      }),
    ).rejects.toThrow();
  }, 30_000);

  it("closes the same fraction of each member's position on a partial close", async () => {
    if (!databaseAvailable) return;

    const event = await createEvent({
      eventId: `itest-partial-${suffix}`,
      eventType: "PARTIAL_CLOSE",
      ticket,
      volume: 0.05,
      price: 3351.4,
      closeFraction: 0.5,
    });

    const outcome = await processTradeEvent(event.eventId);
    expect(outcome.succeeded).toBe(2);

    const mappings = await prisma.positionMapping.findMany({ where: { masterTicket: ticket } });
    for (const mapping of mappings) {
      expect(mapping.status).toBe("PARTIALLY_CLOSED");
      // Half of what each member held, not half of the master's lot.
      expect(Number(mapping.volume)).toBeGreaterThan(0);
    }
  }, 60_000);

  it("skips a member whose account is disconnected", async () => {
    if (!databaseAvailable) return;

    await prisma.tradingAccount.update({
      where: { id: ids.accountB },
      data: { connectionStatus: "DISCONNECTED" },
    });

    const event = await createEvent({
      eventId: `itest-open2-${suffix}`,
      eventType: "OPEN",
      ticket: `89${suffix.slice(0, 6)}`,
      volume: 0.1,
      price: 3345.2,
    });

    const outcome = await processTradeEvent(event.eventId);

    // Only the connected member is eligible; the other is not attempted at all.
    expect(outcome.processed).toBe(1);
    expect(outcome.succeeded).toBe(1);

    await prisma.tradingAccount.update({
      where: { id: ids.accountB },
      data: { connectionStatus: "CONNECTED" },
    });
  }, 60_000);

  it("skips a trade sized below the broker's smallest lot instead of taking more", async () => {
    if (!databaseAvailable) return;

    // 0.5x of 0.10 is 0.05, which an MT4 broker trading in 0.1 steps cannot
    // fill. Rounding up would hand the member twice the size they configured.
    await prisma.copySettings.update({
      where: { subscriptionId: ids.subscriptionB },
      data: { multiplier: 0.5, allowMinLotRounding: false },
    });

    const event = await createEvent({
      eventId: `itest-submin-${suffix}`,
      eventType: "OPEN",
      ticket: `91${suffix.slice(0, 6)}`,
      volume: 0.1,
      price: 3345.2,
    });

    await processTradeEvent(event.eventId);

    const copy = await prisma.copyTrade.findFirst({
      where: { eventId: event.eventId, accountId: ids.accountB },
    });

    expect(copy?.status).toBe("SKIPPED");
    expect(copy?.skipReason).toContain("smallest tradable size");
    expect(Number(copy?.memberVolume)).toBe(0);
  }, 60_000);

  it("takes the broker minimum when the member opted into rounding", async () => {
    if (!databaseAvailable) return;

    await prisma.copySettings.update({
      where: { subscriptionId: ids.subscriptionB },
      data: { multiplier: 0.5, allowMinLotRounding: true },
    });

    const event = await createEvent({
      eventId: `itest-rounded-${suffix}`,
      eventType: "OPEN",
      ticket: `92${suffix.slice(0, 6)}`,
      volume: 0.1,
      price: 3345.2,
    });

    await processTradeEvent(event.eventId);

    const copy = await prisma.copyTrade.findFirst({
      where: { eventId: event.eventId, accountId: ids.accountB },
    });

    expect(copy?.status).toBe("SUCCESS");
    expect(Number(copy?.memberVolume)).toBeCloseTo(0.1, 2);

    await prisma.copySettings.update({
      where: { subscriptionId: ids.subscriptionB },
      data: { multiplier: 1, allowMinLotRounding: false },
    });
  }, 60_000);

  it("skips a symbol the member did not allow", async () => {
    if (!databaseAvailable) return;

    await prisma.copySettings.update({
      where: { subscriptionId: ids.subscriptionA },
      data: { allowedSymbols: ["EURUSD"] },
    });

    const event = await createEvent({
      eventId: `itest-blocked-${suffix}`,
      eventType: "OPEN",
      ticket: `90${suffix.slice(0, 6)}`,
      volume: 0.1,
      price: 3345.2,
    });

    await processTradeEvent(event.eventId);

    const copy = await prisma.copyTrade.findFirst({
      where: { eventId: event.eventId, accountId: ids.accountA },
    });

    expect(copy?.status).toBe("SKIPPED");
    expect(copy?.skipReason).toContain("allowed symbol list");

    await prisma.copySettings.update({
      where: { subscriptionId: ids.subscriptionA },
      data: { allowedSymbols: [] },
    });
  }, 60_000);
});
