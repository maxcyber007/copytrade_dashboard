import { createHash } from "node:crypto";
import type { Strategy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logErrorEvent, logEvent } from "@/lib/logger";
import { toNumber } from "@/lib/utils";
import { getTradeProvider } from "@/providers/trading/factory";
import { ensureProviderSession } from "./account.service";
import { ingestMasterEvent } from "./master-event.service";
import type { MasterEventInput } from "@/lib/validation/master-event";
import type { ProviderPosition } from "@/types/trading";

/**
 * Publishing a strategy straight from a trading account the platform is already
 * connected to — no master EA, no VPS.
 *
 * The account is polled, its open positions compared with what the strategy has
 * recorded, and the differences turned into exactly the trade events an EA would
 * have sent. Everything downstream is unchanged: the same `ingestMasterEvent`,
 * the same idempotency, the same copy engine.
 *
 * Two properties matter more than the diffing itself:
 *
 *   - **Event ids are derived, not random.** Each event id is a hash of what it
 *     describes, so a poll that runs twice — a retry, two workers, a restart
 *     mid-sweep — produces the same id and the second one is rejected as a
 *     duplicate. A copy trading platform that double-sends an OPEN doubles a
 *     member's position.
 *   - **Positions already open when watching starts are never copied.** They are
 *     recorded as a baseline instead. A follower cannot enter a trade that began
 *     before they were following it, at a price that has since moved.
 */

/** Volume differences below this are rounding, not a partial close. */
const VOLUME_EPSILON = 0.0001;
/** Price differences below this are not a stop change. */
const PRICE_EPSILON = 0.00001;

export type WatchResult = {
  strategyId: string;
  /** True on the poll that recorded the baseline rather than publishing. */
  baseline: boolean;
  opened: number;
  modified: number;
  partiallyClosed: number;
  closed: number;
  skipped: number;
};

const empty = (strategyId: string): WatchResult => ({
  strategyId,
  baseline: false,
  opened: 0,
  modified: 0,
  partiallyClosed: 0,
  closed: 0,
  skipped: 0,
});

/**
 * A stable id for one observable change.
 *
 * Hashed rather than concatenated because a ticket plus a strategy id plus a
 * price already exceeds the 80 characters an event id may hold, and a truncated
 * id is one that can collide.
 */
function eventIdFor(strategyId: string, kind: string, ticket: string, detail: string): string {
  const digest = createHash("sha256").update(`${strategyId}|${kind}|${ticket}|${detail}`).digest("hex");
  return `watch-${kind.toLowerCase()}-${digest.slice(0, 40)}`;
}

/** Positions the strategy currently believes are open on the master. */
async function knownPositions(strategyId: string) {
  return prisma.masterTrade.findMany({
    where: { strategyId, status: { in: ["OPEN", "PARTIALLY_CLOSED"] } },
    select: { ticket: true, volume: true, sl: true, tp: true, symbol: true, orderType: true },
  });
}

/**
 * Records what is open right now without publishing any of it.
 *
 * Used the first time a strategy starts watching an account, so that trading
 * already in flight is not replayed to followers at today's price.
 */
async function recordBaseline(strategy: Strategy, positions: ProviderPosition[], masterAccountCode: string) {
  for (const position of positions) {
    await prisma.masterTrade.upsert({
      where: { strategyId_ticket: { strategyId: strategy.id, ticket: position.ticket } },
      update: {},
      create: {
        strategyId: strategy.id,
        masterAccountCode,
        ticket: position.ticket,
        symbol: position.symbol,
        orderType: position.orderType,
        volume: position.volume,
        openPrice: position.openPrice,
        sl: position.sl ?? null,
        tp: position.tp ?? null,
        status: "OPEN",
        openedAt: position.openedAt,
      },
    });
  }

  logEvent({
    event: "MASTER_WATCH_BASELINE",
    strategyId: strategy.id,
    positions: positions.length,
  });
}

/**
 * Polls one strategy's master account and publishes what changed.
 *
 * Returns counts rather than throwing on a single bad event: one symbol the
 * copy engine cannot handle must not stop the rest of the account being
 * published.
 */
export async function pollMasterAccount(strategyId: string): Promise<WatchResult> {
  const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
  if (!strategy?.masterAccountId) return empty(strategyId);

  const account = await prisma.tradingAccount.findUnique({
    where: { id: strategy.masterAccountId },
    select: { id: true, login: true, connectionStatus: true, providerAccountId: true },
  });

  if (!account || account.connectionStatus !== "CONNECTED" || !account.providerAccountId) {
    logEvent({ event: "MASTER_WATCH_SKIPPED", strategyId, reason: "master account is not connected" });
    return empty(strategyId);
  }

  const providerAccountId = await ensureProviderSession(account.id);
  const provider = getTradeProvider();

  const [positions, info] = await Promise.all([
    provider.getPositions(providerAccountId),
    provider.getAccountInfo(providerAccountId).catch(() => null),
  ]);

  const masterAccountCode = strategy.masterAccountCode ?? account.login;
  const result = empty(strategyId);

  // First poll after linking an account: record, do not publish.
  if (!strategy.watchStartedAt) {
    await recordBaseline(strategy, positions, masterAccountCode);
    await prisma.strategy.update({
      where: { id: strategyId },
      data: { watchStartedAt: new Date(), watchLastPollAt: new Date() },
    });
    return { ...result, baseline: true };
  }

  const known = await knownPositions(strategyId);
  const knownByTicket = new Map(known.map((trade) => [trade.ticket, trade]));
  const liveByTicket = new Map(positions.map((position) => [position.ticket, position]));

  const context = {
    strategy,
    masterAccountCode,
    masterBalance: info?.balance ?? null,
    masterEquity: info?.equity ?? null,
  };

  for (const position of positions) {
    const previous = knownByTicket.get(position.ticket);

    if (!previous) {
      // A position the strategy has never seen: the master opened it.
      result.opened += (await publish(context, {
        eventType: "OPEN",
        ticket: position.ticket,
        symbol: position.symbol,
        orderType: position.orderType,
        volume: position.volume,
        price: position.openPrice,
        sl: position.sl,
        tp: position.tp,
        detail: `${position.volume}@${position.openPrice}`,
        occurredAt: position.openedAt,
      }))
        ? 1
        : 0;
      continue;
    }

    const previousVolume = toNumber(previous.volume);

    if (previousVolume - position.volume > VOLUME_EPSILON) {
      // Part of the position is gone: the event carries the volume that was
      // closed, which is what `storeEvent` turns into a fraction.
      const closedVolume = Number((previousVolume - position.volume).toFixed(2));

      result.partiallyClosed += (await publish(context, {
        eventType: "PARTIAL_CLOSE",
        ticket: position.ticket,
        symbol: position.symbol,
        orderType: position.orderType,
        volume: closedVolume,
        price: position.currentPrice,
        sl: position.sl,
        tp: position.tp,
        detail: `${previousVolume}->${position.volume}`,
      }))
        ? 1
        : 0;
      continue;
    }

    if (position.volume - previousVolume > VOLUME_EPSILON) {
      // Adding to a position is a trade the copy engine has no event for. It is
      // counted and logged rather than silently ignored, because a follower
      // whose position stops tracking the master's size is being misled.
      result.skipped += 1;
      logEvent({
        event: "MASTER_WATCH_VOLUME_INCREASE_UNSUPPORTED",
        strategyId,
        ticket: position.ticket,
        from: previousVolume,
        to: position.volume,
      });
      continue;
    }

    const slChanged = Math.abs(toNumber(previous.sl) - (position.sl ?? 0)) > PRICE_EPSILON;
    const tpChanged = Math.abs(toNumber(previous.tp) - (position.tp ?? 0)) > PRICE_EPSILON;

    if (slChanged || tpChanged) {
      result.modified += (await publish(context, {
        eventType: "MODIFY",
        ticket: position.ticket,
        symbol: position.symbol,
        orderType: position.orderType,
        volume: position.volume,
        price: position.currentPrice,
        sl: position.sl,
        tp: position.tp,
        detail: `${position.sl ?? 0}/${position.tp ?? 0}`,
      }))
        ? 1
        : 0;
    }
  }

  for (const previous of known) {
    if (liveByTicket.has(previous.ticket)) continue;

    // Gone from the broker: closed by the master, by a stop, or by hand. The
    // realised price and profit come from the broker's own record, so a stop
    // loss is reported as accurately as a manual close.
    const closed = await provider.getClosedPosition(providerAccountId, previous.ticket).catch(() => null);

    result.closed += (await publish(context, {
      eventType: "CLOSE",
      ticket: previous.ticket,
      symbol: previous.symbol,
      orderType: previous.orderType,
      volume: toNumber(previous.volume),
      price: closed?.closePrice ?? 0,
      profit: closed?.profit ?? null,
      detail: "closed",
      occurredAt: closed?.closedAt,
    }))
      ? 1
      : 0;
  }

  await prisma.strategy.update({ where: { id: strategyId }, data: { watchLastPollAt: new Date() } });

  if (result.opened + result.modified + result.partiallyClosed + result.closed > 0) {
    logEvent({ event: "MASTER_WATCH_PUBLISHED", ...result });
  }

  return result;
}

type PublishContext = {
  strategy: Strategy;
  masterAccountCode: string;
  masterBalance: number | null;
  masterEquity: number | null;
};

type Change = {
  eventType: MasterEventInput["eventType"];
  ticket: string;
  symbol: string;
  orderType: MasterEventInput["orderType"];
  volume: number;
  price: number;
  sl?: number | null;
  tp?: number | null;
  profit?: number | null;
  /** What makes this change distinct, folded into the event id. */
  detail: string;
  occurredAt?: Date;
};

/** Publishes one change. Returns false when it was a duplicate or refused. */
async function publish(context: PublishContext, change: Change): Promise<boolean> {
  const input: MasterEventInput = {
    strategyId: context.strategy.code,
    eventId: eventIdFor(context.strategy.id, change.eventType, change.ticket, change.detail),
    eventType: change.eventType,
    platform: context.strategy.masterPlatform,
    masterAccount: context.masterAccountCode,
    ticket: change.ticket,
    symbol: change.symbol,
    orderType: change.orderType,
    volume: change.volume,
    price: change.price,
    sl: change.sl ?? null,
    tp: change.tp ?? null,
    profit: change.profit ?? null,
    masterBalance: context.masterBalance,
    masterEquity: context.masterEquity,
    timestamp: (change.occurredAt ?? new Date()).toISOString(),
  };

  try {
    const result = await ingestMasterEvent(context.strategy, input, {});
    return result.status === "QUEUED";
  } catch (error) {
    // One unpublishable change must not stop the rest of the account.
    logErrorEvent({
      event: "MASTER_WATCH_PUBLISH_FAILED",
      strategyId: context.strategy.id,
      ticket: change.ticket,
      eventType: change.eventType,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

/** Polls every strategy publishing from a watched account. */
export async function pollAllMasterAccounts(): Promise<{ strategies: number; failed: number }> {
  const strategies = await prisma.strategy.findMany({
    where: { status: "ACTIVE", masterAccountId: { not: null } },
    select: { id: true },
  });

  let failed = 0;

  for (const strategy of strategies) {
    try {
      await pollMasterAccount(strategy.id);
    } catch (error) {
      failed += 1;
      logErrorEvent({
        event: "MASTER_WATCH_FAILED",
        strategyId: strategy.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return { strategies: strategies.length, failed };
}
