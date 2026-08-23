import { prisma } from "@/lib/prisma";
import { logErrorEvent } from "@/lib/logger";
import { getTradeProvider } from "@/providers/trading/factory";
import { ensureProviderSession } from "./account.service";
import type { AccountTrade } from "@/types/trading";

export type TradeHistoryRow = Omit<AccountTrade, "closedAt"> & {
  /** Null while the position is still open. */
  closedAt: Date | null;
  /** Set when this platform copied the trade; absent for the member's own. */
  strategyName?: string;
  copied: boolean;
};

export type TradeHistory = {
  rows: TradeHistoryRow[];
  from: Date;
  to: Date;
  /** Null when the broker could be reached; a reason when it could not. */
  brokerUnavailable: string | null;
  totals: { profit: number; wins: number; losses: number; volume: number };
};

/**
 * One account's trade history: everything the broker recorded, marked up with
 * what this platform recognises as its own.
 *
 * The two sources answer different halves of the question. The broker knows
 * every trade on the account — including ones the member placed by hand and
 * ones from before they connected — but nothing about strategies. The platform
 * knows which position it copied and for whom, but only for the ones it placed.
 *
 * When the broker cannot be reached the copied positions are still shown, with
 * the gap stated rather than a short history passed off as a complete one.
 */
export async function getAccountTradeHistory(
  accountId: string,
  userId: string,
  options: { days?: number } = {},
): Promise<TradeHistory> {
  const account = await prisma.tradingAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, connectionStatus: true, providerAccountId: true },
  });

  if (!account) throw new Error("Trading account not found");

  const days = options.days ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const mappings = await prisma.positionMapping.findMany({
    where: { accountId, OR: [{ closedAt: { gte: from } }, { status: { in: ["OPEN", "PARTIALLY_CLOSED"] } }] },
    select: {
      memberTicket: true,
      ticketHistory: true,
      symbol: true,
      orderType: true,
      volume: true,
      openPrice: true,
      closePrice: true,
      profit: true,
      closeReason: true,
      openedAt: true,
      closedAt: true,
      status: true,
      subscription: { select: { strategy: { select: { name: true } } } },
    },
  });

  // A ticket can have been superseded by an MT4 partial close, so every ticket
  // a mapping has ever held points at the same strategy.
  const strategyByTicket = new Map<string, string>();
  for (const mapping of mappings) {
    const name = mapping.subscription?.strategy.name;
    if (!name) continue;
    for (const ticket of [mapping.memberTicket, ...mapping.ticketHistory]) strategyByTicket.set(ticket, name);
  }

  let brokerTrades: AccountTrade[] = [];
  let brokerUnavailable: string | null = null;

  if (account.connectionStatus === "CONNECTED" && account.providerAccountId) {
    try {
      const providerAccountId = await ensureProviderSession(accountId);
      brokerTrades = await getTradeProvider().getTradeHistory(providerAccountId, { from, to });
    } catch (error) {
      brokerUnavailable = error instanceof Error ? error.message : "The broker could not be reached";
      logErrorEvent({ event: "TRADE_HISTORY_FETCH_FAILED", accountId, reason: brokerUnavailable });
    }
  } else {
    brokerUnavailable = "This account is not connected, so only positions copied by the platform are shown.";
  }

  const rows: TradeHistoryRow[] = brokerTrades.map((trade) => ({
    ...trade,
    strategyName: strategyByTicket.get(trade.ticket),
    copied: strategyByTicket.has(trade.ticket),
  }));

  const seen = new Set(rows.map((row) => row.ticket));

  // Copied positions the broker did not return — still open, or outside what it
  // reported — so the platform's own record is never silently dropped.
  for (const mapping of mappings) {
    if (seen.has(mapping.memberTicket)) continue;

    rows.push({
      ticket: mapping.memberTicket,
      symbol: mapping.symbol,
      orderType: mapping.orderType,
      volume: Number(mapping.volume),
      openPrice: Number(mapping.openPrice),
      closePrice: mapping.closePrice === null ? undefined : Number(mapping.closePrice),
      profit: mapping.profit === null ? 0 : Number(mapping.profit),
      openedAt: mapping.openedAt,
      closedAt: mapping.closedAt,
      reason: mapping.closeReason ?? undefined,
      strategyName: mapping.subscription?.strategy.name,
      copied: true,
    });
  }

  // Still-open positions sort to the top: they are the ones being watched.
  const when = (row: TradeHistoryRow) => row.closedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  rows.sort((a, b) => when(b) - when(a));

  const closed = rows.filter((row) => row.closedAt !== null);

  return {
    rows,
    from,
    to,
    brokerUnavailable,
    totals: {
      profit: Number(closed.reduce((total, row) => total + row.profit, 0).toFixed(2)),
      wins: closed.filter((row) => row.profit > 0).length,
      losses: closed.filter((row) => row.profit < 0).length,
      volume: Number(closed.reduce((total, row) => total + row.volume, 0).toFixed(2)),
    },
  };
}
