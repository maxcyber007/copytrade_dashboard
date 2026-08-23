import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Field allowlist for anything that leaves the server. Encrypted credentials
 * are never part of it, so a password cannot reach an API response by accident.
 */
export const safeAccountSelect = {
  id: true,
  label: true,
  platform: true,
  broker: true,
  login: true,
  server: true,
  accountType: true,
  accountRole: true,
  currency: true,
  positionMode: true,
  brokerMinLot: true,
  brokerMaxLot: true,
  brokerLotStep: true,
  connectionStatus: true,
  copyStatus: true,
  lastError: true,
  lastErrorCode: true,
  lastSyncAt: true,
  connectedAt: true,
  balance: true,
  equity: true,
  margin: true,
  freeMargin: true,
  floatingPnl: true,
  peakEquity: true,
  openTrades: true,
  createdAt: true,
} satisfies Prisma.TradingAccountSelect;

export const accountRepository = {
  listForUser: (userId: string) =>
    prisma.tradingAccount.findMany({
      where: { userId },
      select: safeAccountSelect,
      orderBy: { createdAt: "desc" },
    }),

  /** Ownership is a WHERE clause, never a client-supplied flag. */
  findOwned: (id: string, userId: string) =>
    prisma.tradingAccount.findFirst({ where: { id, userId }, select: safeAccountSelect }),

  findOwnedWithSecrets: (id: string, userId: string) =>
    prisma.tradingAccount.findFirst({ where: { id, userId } }),

  countForUser: (userId: string) => prisma.tradingAccount.count({ where: { userId } }),

  existsForUser: (userId: string, login: string, server: string) =>
    prisma.tradingAccount.findFirst({ where: { userId, login, server }, select: { id: true } }),

  create: (data: Prisma.TradingAccountUncheckedCreateInput) =>
    prisma.tradingAccount.create({ data, select: safeAccountSelect }),

  update: (id: string, data: Prisma.TradingAccountUncheckedUpdateInput) =>
    prisma.tradingAccount.update({ where: { id }, data, select: safeAccountSelect }),

  delete: (id: string) => prisma.tradingAccount.delete({ where: { id } }),

  listForAdmin: (params: { take?: number; skip?: number } = {}) =>
    prisma.tradingAccount.findMany({
      take: params.take ?? 100,
      skip: params.skip,
      orderBy: { createdAt: "desc" },
      select: { ...safeAccountSelect, user: { select: { id: true, email: true } } },
    }),

  countByConnectionStatus: () => prisma.tradingAccount.groupBy({ by: ["connectionStatus"], _count: true }),

  countByCopyStatus: () => prisma.tradingAccount.groupBy({ by: ["copyStatus"], _count: true }),
};
