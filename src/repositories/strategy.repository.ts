import type { Prisma, StrategyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Fields any signed-in member may see about a strategy. */
export const publicStrategySelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  status: true,
  ownerType: true,
  masterPlatform: true,
  minPlanTier: true,
  totalReturnPct: true,
  maxDrawdownPct: true,
  winRatePct: true,
  totalTrades: true,
  memberCount: true,
  createdAt: true,
  provider: { select: { displayName: true, slug: true, performanceFeePct: true, subscriptionPriceMonthly: true } },
} satisfies Prisma.StrategySelect;

export const strategyRepository = {
  listPublic: () =>
    prisma.strategy.findMany({
      where: { isPublic: true, status: { in: ["ACTIVE", "PAUSED"] } },
      select: publicStrategySelect,
      orderBy: [{ memberCount: "desc" }, { createdAt: "desc" }],
    }),

  findPublic: (id: string) =>
    prisma.strategy.findFirst({ where: { id, isPublic: true }, select: publicStrategySelect }),

  findById: (id: string) => prisma.strategy.findUnique({ where: { id } }),

  findByCode: (code: string) => prisma.strategy.findUnique({ where: { code } }),

  listAll: () =>
    prisma.strategy.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        provider: { select: { displayName: true, slug: true } },
        _count: { select: { subscriptions: true, tradeEvents: true } },
      },
    }),

  listForProvider: (providerId: string) =>
    prisma.strategy.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { subscriptions: true, tradeEvents: true } },
        apiKeys: { where: { revokedAt: null }, select: { id: true, keyId: true, label: true, lastUsedAt: true, createdAt: true } },
      },
    }),

  create: (data: Prisma.StrategyUncheckedCreateInput) => prisma.strategy.create({ data }),

  update: (id: string, data: Prisma.StrategyUncheckedUpdateInput) =>
    prisma.strategy.update({ where: { id }, data }),

  delete: (id: string) => prisma.strategy.delete({ where: { id } }),

  countByStatus: () => prisma.strategy.groupBy({ by: ["status"], _count: true }),

  count: (status?: StrategyStatus) => prisma.strategy.count({ where: { status } }),
};
