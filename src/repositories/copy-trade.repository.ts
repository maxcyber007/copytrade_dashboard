import type { CopyTradeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const copyTradeRepository = {
  listForUser: (userId: string, params: { take?: number; skip?: number; status?: CopyTradeStatus } = {}) =>
    prisma.copyTrade.findMany({
      where: { account: { userId }, status: params.status },
      take: params.take ?? 50,
      skip: params.skip,
      orderBy: { createdAt: "desc" },
      include: {
        account: { select: { id: true, label: true, platform: true } },
        strategy: { select: { id: true, name: true, code: true } },
      },
    }),

  countForUser: (userId: string, status?: CopyTradeStatus) =>
    prisma.copyTrade.count({ where: { account: { userId }, status } }),

  listForAdmin: (params: { take?: number; skip?: number } = {}) =>
    prisma.copyTrade.findMany({
      take: params.take ?? 100,
      skip: params.skip,
      orderBy: { createdAt: "desc" },
      include: {
        account: { select: { id: true, label: true, user: { select: { email: true } } } },
        strategy: { select: { name: true, code: true } },
      },
    }),

  countByStatus: () => prisma.copyTrade.groupBy({ by: ["status"], _count: true }),

  /** Aggregates for the member performance page. */
  performanceForUser: (userId: string) =>
    prisma.copyTrade.aggregate({
      where: { account: { userId }, status: "SUCCESS" },
      _count: true,
      _sum: { profit: true },
      _avg: { latencyMs: true },
    }),

  create: (data: Prisma.CopyTradeUncheckedCreateInput) => prisma.copyTrade.create({ data }),
};
