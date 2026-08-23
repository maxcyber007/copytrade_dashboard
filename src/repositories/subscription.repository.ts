import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicStrategySelect } from "./strategy.repository";

export const subscriptionRepository = {
  listForUser: (userId: string) =>
    prisma.strategySubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        strategy: { select: publicStrategySelect },
        account: { select: { id: true, label: true, platform: true, broker: true, connectionStatus: true, currency: true } },
        copySettings: true,
        riskProfile: true,
      },
    }),

  findOwned: (id: string, userId: string) =>
    prisma.strategySubscription.findFirst({
      where: { id, userId },
      include: { strategy: { select: publicStrategySelect }, account: { select: { id: true, label: true } } },
    }),

  findByAccountAndStrategy: (accountId: string, strategyId: string) =>
    prisma.strategySubscription.findUnique({ where: { accountId_strategyId: { accountId, strategyId } } }),

  create: (data: Prisma.StrategySubscriptionUncheckedCreateInput) =>
    prisma.strategySubscription.create({ data }),

  update: (id: string, data: Prisma.StrategySubscriptionUncheckedUpdateInput) =>
    prisma.strategySubscription.update({ where: { id }, data }),

  delete: (id: string) => prisma.strategySubscription.delete({ where: { id } }),

  countActiveForStrategy: (strategyId: string) =>
    prisma.strategySubscription.count({ where: { strategyId, status: "ACTIVE" } }),

  countByCopyStatus: () => prisma.strategySubscription.groupBy({ by: ["copyStatus"], _count: true }),

  listForStrategy: (strategyId: string) =>
    prisma.strategySubscription.findMany({
      where: { strategyId },
      include: { account: { select: { id: true, label: true, platform: true, connectionStatus: true } } },
    }),
};
