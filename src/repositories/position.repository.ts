import { prisma } from "@/lib/prisma";

/**
 * Positions as they existed on a member's own account.
 *
 * This is a different question from the copy history: that records every event
 * and every attempt, successful or not, while this records the positions that
 * actually existed at the broker and what became of them.
 */
export const positionRepository = {
  /** One account's positions, newest first. Ownership is checked by the caller. */
  listForAccount: (accountId: string, options: { take?: number } = {}) =>
    prisma.positionMapping.findMany({
      where: { accountId },
      select: {
        id: true,
        symbol: true,
        orderType: true,
        volume: true,
        openPrice: true,
        closePrice: true,
        profit: true,
        closeReason: true,
        sl: true,
        tp: true,
        status: true,
        openedAt: true,
        closedAt: true,
        memberTicket: true,
        ticketHistory: true,
        masterTicket: true,
        subscription: { select: { strategy: { select: { name: true, code: true } } } },
      },
      orderBy: [{ openedAt: "desc" }],
      take: options.take ?? 200,
    }),

  /**
   * Totals for the account's closed positions.
   *
   * Only positions whose result the broker actually reported are counted:
   * a total that silently treats an unknown profit as zero would read as a
   * flat trade rather than a missing one.
   */
  summaryForAccount: async (accountId: string) => {
    const [closedWithResult, openCount, closedCount] = await Promise.all([
      prisma.positionMapping.findMany({
        where: { accountId, status: "CLOSED", profit: { not: null } },
        select: { profit: true },
      }),
      prisma.positionMapping.count({ where: { accountId, status: { in: ["OPEN", "PARTIALLY_CLOSED"] } } }),
      prisma.positionMapping.count({ where: { accountId, status: "CLOSED" } }),
    ]);

    const profits = closedWithResult.map((row) => Number(row.profit));
    const wins = profits.filter((value) => value > 0).length;

    return {
      openCount,
      closedCount,
      /** Closed positions the broker has reported a result for. */
      settledCount: profits.length,
      netProfit: Number(profits.reduce((total, value) => total + value, 0).toFixed(2)),
      winRatePct: profits.length > 0 ? Number(((wins / profits.length) * 100).toFixed(1)) : null,
    };
  },
};
