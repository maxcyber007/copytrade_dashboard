import type { CopySettings, RiskProfile, TradeEvent, TradingAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import { logErrorEvent, logEvent } from "@/lib/logger";
import { toNumber } from "@/lib/utils";
import { getTradeProvider } from "@/providers/trading/factory";
import type { ITradeProvider } from "@/providers/trading/ITradeProvider";
import type { OrderResult, ProviderPosition } from "@/types/trading";
import { calculateLot } from "./risk/lot-calculator";
import { evaluateRisk } from "./risk/risk-engine";
import { resolveMemberSymbol } from "./symbol-mapping.service";
import { AuditAction, recordAudit } from "./audit.service";
import { ensureProviderSession } from "./account.service";
import { publishUserEvent } from "@/lib/events";

/** Contract sizes used for risk-percent sizing when the broker does not report one. */
const CONTRACT_SIZES: Record<string, number> = {
  XAUUSD: 100,
  XAGUSD: 5000,
  BTCUSD: 1,
  US30: 1,
  NAS100: 1,
};

export type CopyOutcome = {
  eventId: string;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

/**
 * Fans one verified master event out to every eligible subscriber.
 *
 * Idempotency is structural, not best-effort: the `CopyTrade` row is created
 * first, inside the unique `(eventId, accountId)` constraint. If the row
 * already exists this event has been handled (or is in flight) for that member,
 * and no order is sent. That is what makes a retry — or a second worker — safe
 * on a real money account.
 */
export async function processTradeEvent(eventId: string): Promise<CopyOutcome> {
  const event = await prisma.tradeEvent.findUnique({
    where: { eventId },
    include: { strategy: true, masterTrade: true },
  });

  if (!event) throw new AppError(ErrorCode.NOT_FOUND, `Trade event ${eventId} not found`);

  if (event.status === "PROCESSED") {
    logEvent({ event: "COPY_EVENT_ALREADY_PROCESSED", eventId });
    return { eventId, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  await prisma.tradeEvent.update({ where: { eventId }, data: { status: "PROCESSING" } });

  // Only accounts we can actually reach, on subscriptions the member started.
  const subscriptions = await prisma.strategySubscription.findMany({
    where: {
      strategyId: event.strategyId,
      status: "ACTIVE",
      copyStatus: "COPYING",
      account: { connectionStatus: "CONNECTED" },
    },
    include: { account: true, copySettings: true, riskProfile: true },
  });

  const outcome: CopyOutcome = { eventId, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  const provider = getTradeProvider();

  for (const subscription of subscriptions) {
    outcome.processed += 1;
    try {
      // The worker is its own process, so it may hold no provider session for
      // this account yet — establish it before touching the broker.
      const providerAccountId = await ensureProviderSession(subscription.accountId);

      const result = await copyToMember({
        provider,
        providerAccountId,
        event,
        subscription: {
          id: subscription.id,
          accountId: subscription.accountId,
          userId: subscription.userId,
          settings: subscription.copySettings,
          risk: subscription.riskProfile,
          account: subscription.account,
        },
      });

      if (result === "SUCCESS") outcome.succeeded += 1;
      else if (result === "SKIPPED") outcome.skipped += 1;
      else outcome.failed += 1;
    } catch (error) {
      outcome.failed += 1;
      logErrorEvent({
        event: "COPY_MEMBER_FAILED",
        eventId,
        accountId: subscription.accountId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  await prisma.tradeEvent.update({
    where: { eventId },
    data: { status: "PROCESSED", processedAt: new Date(), fanOutCount: outcome.processed },
  });

  logEvent({
    event: "COPY_EVENT_PROCESSED",
    strategyId: event.strategyId,
    eventType: event.eventType,
    ...outcome,
  });

  return outcome;
}

type MemberContext = {
  provider: ITradeProvider;
  /** Live provider session for this account in *this* process. */
  providerAccountId: string;
  event: TradeEvent & { strategy: { id: string; name: string }; masterTrade: { id: string } | null };
  subscription: {
    id: string;
    accountId: string;
    userId: string;
    settings: CopySettings | null;
    risk: RiskProfile | null;
    account: TradingAccount;
  };
};

async function copyToMember(context: MemberContext): Promise<"SUCCESS" | "FAILED" | "SKIPPED"> {
  const { event, subscription, provider } = context;
  const account = subscription.account;

  const memberSymbol = await resolveMemberSymbol({
    masterSymbol: event.symbol,
    strategyId: event.strategyId,
    accountId: account.id,
  });

  // The row is the lock. A duplicate here means the work is already done or in
  // flight, and the only safe action is to stop.
  let copyTradeId: string;
  try {
    const created = await prisma.copyTrade.create({
      data: {
        eventId: event.eventId,
        strategyId: event.strategyId,
        subscriptionId: subscription.id,
        accountId: account.id,
        masterTradeId: event.masterTradeId,
        eventType: event.eventType,
        masterTicket: event.ticket,
        masterSymbol: event.symbol,
        memberSymbol,
        orderType: event.orderType,
        masterVolume: event.volume,
        memberVolume: 0,
        masterPrice: event.price,
        sl: event.sl,
        tp: event.tp,
        status: "PENDING",
      },
      select: { id: true },
    });
    copyTradeId = created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      logEvent({ event: "COPY_DUPLICATE_SUPPRESSED", eventId: event.eventId, accountId: account.id });
      return "SKIPPED";
    }
    throw error;
  }

  const startedAt = Date.now();

  try {
    const outcome =
      event.eventType === "OPEN" || event.eventType === "PENDING_ORDER"
        ? await openForMember(context, { copyTradeId, memberSymbol })
        : await adjustForMember(context, { copyTradeId, memberSymbol });

    await prisma.copyTrade.update({
      where: { id: copyTradeId },
      data: { latencyMs: Date.now() - startedAt },
    });

    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copy failed";
    await prisma.copyTrade.update({
      where: { id: copyTradeId },
      data: {
        status: "FAILED",
        errorCode: error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR,
        errorMessage: message,
        latencyMs: Date.now() - startedAt,
        attempts: { increment: 1 },
      },
    });

    await recordSystemError({
      code: error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR,
      message,
      accountId: account.id,
      eventId: event.eventId,
    });

    return "FAILED";
  }
}

/** OPEN / PENDING_ORDER: size the trade, check risk, then send it. */
async function openForMember(
  context: MemberContext,
  refs: { copyTradeId: string; memberSymbol: string },
): Promise<"SUCCESS" | "FAILED" | "SKIPPED"> {
  const { event, subscription, provider } = context;
  const account = subscription.account;
  const settings = subscription.settings;

  if (!settings) {
    return skip(refs.copyTradeId, "SKIPPED", "No copy settings on this subscription");
  }

  const positions = await provider.getPositions(context.providerAccountId);

  // Retry safety: if an order carrying this copy id already exists on the
  // account, the previous attempt did land and must not be sent again.
  const existing = positions.find((position) => position.comment === refs.copyTradeId);
  if (existing) {
    await recordFill(
      refs.copyTradeId,
      { executed: true, ticket: existing.ticket, price: existing.openPrice, volume: existing.volume, raw: { recovered: true } },
      existing.volume,
      subscription,
      event,
      refs.memberSymbol,
      event.strategy.name,
    );
    logEvent({ event: "COPY_RECOVERED_EXISTING_ORDER", copyTradeId: refs.copyTradeId, ticket: existing.ticket });
    return "SUCCESS";
  }

  const spec = await provider.getSymbolSpec(context.providerAccountId, refs.memberSymbol);
  if (!spec || !spec.tradeAllowed) {
    return skip(refs.copyTradeId, "SKIPPED", `Symbol ${refs.memberSymbol} is not tradable on this account`, ErrorCode.INVALID_SYMBOL);
  }

  const stopDistance = event.sl ? Math.abs(toNumber(event.price) - toNumber(event.sl)) : null;

  const lot = calculateLot({
    mode: settings.lotMode,
    masterVolume: toNumber(event.volume),
    fixedLot: toNumber(settings.fixedLot),
    multiplier: toNumber(settings.multiplier),
    balanceRatio: toNumber(settings.balanceRatio),
    riskPercent: toNumber(settings.riskPercent),
    minLot: toNumber(settings.minLot),
    maxLot: toNumber(settings.maxLot),
    brokerMinLot: Math.max(toNumber(account.brokerMinLot), spec.minLot),
    brokerMaxLot: Math.min(toNumber(account.brokerMaxLot), spec.maxLot),
    brokerLotStep: Math.max(toNumber(account.brokerLotStep), spec.lotStep),
    allowMinLotRounding: settings.allowMinLotRounding,
    memberBalance: toNumber(account.balance),
    memberEquity: toNumber(account.equity),
    masterBalance: event.masterBalance ? toNumber(event.masterBalance) : null,
    stopDistance,
    contractSize: CONTRACT_SIZES[refs.memberSymbol] ?? 100_000,
  });

  if (!lot.ok) {
    return skip(refs.copyTradeId, "SKIPPED", lot.reason, ErrorCode.INVALID_VOLUME);
  }

  const riskState = await loadRiskState(account);
  const decision = evaluateRisk({
    symbol: refs.memberSymbol,
    orderType: event.orderType,
    volume: lot.volume,
    allowedSymbols: settings.allowedSymbols,
    copyBuy: settings.copyBuy,
    copySell: settings.copySell,
    copyPendingOrders: settings.copyPendingOrders,
    maxOpenTrades: settings.maxOpenTrades,
    maxDailyLoss: toNumber(subscription.risk?.maxDailyLoss ?? 0),
    maxDailyLossPct: toNumber(subscription.risk?.maxDailyLossPct ?? 0),
    maxDrawdownPct: toNumber(subscription.risk?.maxDrawdownPct ?? 0),
    maxLotPerTrade: toNumber(subscription.risk?.maxLotPerTrade ?? 0),
    maxTotalLot: toNumber(subscription.risk?.maxTotalLot ?? 0),
    openTrades: positions.length,
    openVolume: positions.reduce((total, position) => total + position.volume, 0),
    equity: toNumber(account.equity),
    peakEquity: toNumber(account.peakEquity),
    dailyStartEquity: riskState.dailyStartEquity,
    dailyRealizedPnl: riskState.dailyRealizedPnl,
    alreadyBreached: riskState.breached,
  });

  if (!decision.allowed) {
    if (decision.shouldPause && subscription.risk?.stopCopyOnBreach !== false) {
      await pauseForBreach(subscription, decision.reason);
    }
    return skip(refs.copyTradeId, "SKIPPED", decision.reason, decision.code);
  }

  const request = {
    symbol: refs.memberSymbol,
    orderType: event.orderType,
    volume: lot.volume,
    sl: settings.copySl && event.sl ? toNumber(event.sl) : undefined,
    tp: settings.copyTp && event.tp ? toNumber(event.tp) : undefined,
    slippagePoints: settings.slippagePoints,
    clientId: refs.copyTradeId,
  };

  const result = await provider.openPosition(context.providerAccountId, request);

  await prisma.copyTrade.update({
    where: { id: refs.copyTradeId },
    data: { providerRequest: request as never, attempts: { increment: 1 } },
  });

  // A response is not a fill: only an execution with a broker ticket counts.
  if (!result.executed || !result.ticket) {
    await prisma.copyTrade.update({
      where: { id: refs.copyTradeId },
      data: {
        status: "FAILED",
        memberVolume: lot.volume,
        errorCode: result.errorCode ?? ErrorCode.PROVIDER_ERROR,
        errorMessage: result.errorMessage ?? "Provider did not confirm an execution",
        providerResponse: result as never,
      },
    });
    await recordAudit({
      action: AuditAction.TRADE_FAILED,
      userId: subscription.userId,
      resourceType: "CopyTrade",
      resourceId: refs.copyTradeId,
      metadata: { errorCode: result.errorCode, symbol: refs.memberSymbol },
    });

    await publishUserEvent(subscription.userId, {
      type: "COPY_TRADE",
      status: "FAILED",
      symbol: refs.memberSymbol,
      volume: lot.volume,
      strategy: event.strategy.name,
      at: new Date().toISOString(),
    });

    return "FAILED";
  }

  await recordFill(refs.copyTradeId, result, lot.volume, subscription, event, refs.memberSymbol, event.strategy.name);
  return "SUCCESS";
}

/** MODIFY / CLOSE / PARTIAL_CLOSE / DELETE_PENDING: act on the mapped position. */
async function adjustForMember(
  context: MemberContext,
  refs: { copyTradeId: string; memberSymbol: string },
): Promise<"SUCCESS" | "FAILED" | "SKIPPED"> {
  const { event, subscription, provider } = context;
  const account = subscription.account;

  const mapping = await prisma.positionMapping.findUnique({
    where: { accountId_masterTicket: { accountId: account.id, masterTicket: event.ticket } },
  });

  // A member who subscribed after the master opened this position has nothing
  // to modify. That is a skip, never a guess at which position was meant.
  if (!mapping || mapping.status === "CLOSED") {
    return skip(refs.copyTradeId, "SKIPPED", "No open position mapped to this master ticket", ErrorCode.POSITION_NOT_FOUND);
  }

  let result: OrderResult;

  if (event.eventType === "MODIFY") {
    const settings = subscription.settings;
    result = await provider.modifyPosition(context.providerAccountId, {
      ticket: mapping.memberTicket,
      sl: settings?.copySl !== false && event.sl ? toNumber(event.sl) : undefined,
      tp: settings?.copyTp !== false && event.tp ? toNumber(event.tp) : undefined,
    });
  } else {
    // Proportional close: the member closes the same fraction of their own
    // position that the master closed of theirs. The fraction was computed at
    // ingest, where the master's pre-close volume was still known.
    const fraction = event.closeFraction ? toNumber(event.closeFraction) : 1;

    const closeVolume =
      event.eventType === "PARTIAL_CLOSE"
        ? Math.max(Number((toNumber(mapping.volume) * fraction).toFixed(2)), 0.01)
        : undefined;

    result = await provider.closePosition(context.providerAccountId, {
      ticket: mapping.memberTicket,
      volume: closeVolume,
    });
  }

  await prisma.copyTrade.update({
    where: { id: refs.copyTradeId },
    data: { attempts: { increment: 1 }, providerResponse: result as never, memberTicket: mapping.memberTicket },
  });

  if (!result.executed) {
    await prisma.copyTrade.update({
      where: { id: refs.copyTradeId },
      data: {
        status: "FAILED",
        errorCode: result.errorCode ?? ErrorCode.PROVIDER_ERROR,
        errorMessage: result.errorMessage ?? "Provider did not confirm the adjustment",
      },
    });
    return "FAILED";
  }

  // MT4 partial close closes the ticket and opens a new one for the remainder.
  // Without this remap the leftover position would be orphaned.
  if (result.remainderTicket) {
    await prisma.positionMapping.update({
      where: { id: mapping.id },
      data: {
        memberTicket: result.remainderTicket,
        ticketHistory: { push: mapping.memberTicket },
        volume: Number((toNumber(mapping.volume) - (result.volume ?? 0)).toFixed(2)),
        status: "PARTIALLY_CLOSED",
      },
    });
    logEvent({
      event: "POSITION_TICKET_REMAPPED",
      accountId: account.id,
      from: mapping.memberTicket,
      to: result.remainderTicket,
    });
  } else if (event.eventType === "PARTIAL_CLOSE") {
    await prisma.positionMapping.update({
      where: { id: mapping.id },
      data: {
        volume: Number((toNumber(mapping.volume) - (result.volume ?? 0)).toFixed(2)),
        status: "PARTIALLY_CLOSED",
      },
    });
  } else if (event.eventType === "CLOSE" || event.eventType === "DELETE_PENDING") {
    await prisma.positionMapping.update({
      where: { id: mapping.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    await prisma.tradingAccount.update({
      where: { id: account.id },
      data: { openTrades: { decrement: 1 } },
    });
  }

  await prisma.copyTrade.update({
    where: { id: refs.copyTradeId },
    data: { status: "SUCCESS", executedAt: new Date(), memberVolume: result.volume ?? toNumber(mapping.volume) },
  });

  return "SUCCESS";
}

// ---------------------------------------------------------------------------

async function recordFill(
  copyTradeId: string,
  result: OrderResult,
  volume: number,
  subscription: MemberContext["subscription"],
  event: TradeEvent,
  memberSymbol: string,
  strategyName: string,
) {
  await prisma.copyTrade.update({
    where: { id: copyTradeId },
    data: {
      status: "SUCCESS",
      memberTicket: result.ticket,
      memberVolume: volume,
      memberPrice: result.price ?? null,
      providerResponse: result as never,
      executedAt: new Date(),
    },
  });

  await prisma.positionMapping.upsert({
    where: { accountId_masterTicket: { accountId: subscription.accountId, masterTicket: event.ticket } },
    update: { memberTicket: result.ticket!, volume, status: "OPEN" },
    create: {
      masterTradeId: event.masterTradeId,
      subscriptionId: subscription.id,
      accountId: subscription.accountId,
      masterTicket: event.ticket,
      memberTicket: result.ticket!,
      symbol: memberSymbol,
      orderType: event.orderType,
      volume,
      openPrice: result.price ?? toNumber(event.price),
      sl: event.sl,
      tp: event.tp,
      status: "OPEN",
    },
  });

  await prisma.tradingAccount.update({
    where: { id: subscription.accountId },
    data: { openTrades: { increment: 1 } },
  });

  await recordAudit({
    action: AuditAction.TRADE_COPIED,
    userId: subscription.userId,
    resourceType: "CopyTrade",
    resourceId: copyTradeId,
    metadata: { symbol: memberSymbol, volume, ticket: result.ticket },
  });

  // The worker cannot reach the browser; the web tier relays this.
  await publishUserEvent(subscription.userId, {
    type: "COPY_TRADE",
    status: "SUCCESS",
    symbol: memberSymbol,
    volume,
    strategy: strategyName,
    at: new Date().toISOString(),
  });
}

async function skip(
  copyTradeId: string,
  status: "SKIPPED",
  reason: string,
  code?: string,
): Promise<"SKIPPED"> {
  await prisma.copyTrade.update({
    where: { id: copyTradeId },
    data: { status, skipReason: reason, errorCode: code ?? null },
  });
  return "SKIPPED";
}

async function loadRiskState(account: TradingAccount) {
  const today = startOfToday();

  const state = await prisma.riskState.upsert({
    where: { accountId: account.id },
    update: {},
    create: {
      accountId: account.id,
      tradingDay: today,
      dailyStartEquity: toNumber(account.equity),
    },
  });

  // A new trading day resets the daily counters rather than carrying yesterday's.
  if (state.tradingDay.getTime() !== today.getTime()) {
    const reset = await prisma.riskState.update({
      where: { accountId: account.id },
      data: {
        tradingDay: today,
        dailyStartEquity: toNumber(account.equity),
        dailyRealizedPnl: 0,
        breached: false,
        breachReason: null,
        breachedAt: null,
      },
    });
    return {
      dailyStartEquity: toNumber(reset.dailyStartEquity),
      dailyRealizedPnl: toNumber(reset.dailyRealizedPnl),
      breached: reset.breached,
    };
  }

  return {
    dailyStartEquity: toNumber(state.dailyStartEquity),
    dailyRealizedPnl: toNumber(state.dailyRealizedPnl),
    breached: state.breached,
  };
}

/** A breach stops copying for this member: the limit is theirs to reset. */
async function pauseForBreach(subscription: MemberContext["subscription"], reason: string) {
  await prisma.$transaction([
    prisma.strategySubscription.update({
      where: { id: subscription.id },
      data: { copyStatus: "PAUSED", pausedAt: new Date() },
    }),
    prisma.riskState.upsert({
      where: { accountId: subscription.accountId },
      update: { breached: true, breachReason: reason, breachedAt: new Date() },
      create: {
        accountId: subscription.accountId,
        tradingDay: startOfToday(),
        breached: true,
        breachReason: reason,
        breachedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: subscription.userId,
        type: "WARNING",
        title: "Copying paused by a risk limit",
        message: reason,
        link: "/strategies",
      },
    }),
  ]);

  await recordAudit({
    action: AuditAction.RISK_TRIGGERED,
    userId: subscription.userId,
    resourceType: "StrategySubscription",
    resourceId: subscription.id,
    metadata: { reason },
  });

  await publishUserEvent(subscription.userId, {
    type: "RISK_BREACH",
    reason,
    at: new Date().toISOString(),
  });

  logEvent({ event: "RISK_BREACH_PAUSED_COPYING", accountId: subscription.accountId, reason });
}

async function recordSystemError(input: {
  code: string;
  message: string;
  accountId?: string;
  eventId?: string;
}) {
  try {
    await prisma.systemError.create({
      data: {
        code: input.code,
        severity: "HIGH",
        source: "engine",
        message: input.message,
        accountId: input.accountId,
        eventId: input.eventId,
      },
    });
  } catch {
    // Never let error recording break the copy loop.
  }
}

function startOfToday(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002"
  );
}
