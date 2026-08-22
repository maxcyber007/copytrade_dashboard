import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** All database access for users lives here — services never call Prisma directly. */
export const userRepository = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  findById: (id: string) => prisma.user.findUnique({ where: { id } }),

  create: (data: Prisma.UserCreateInput): Promise<User> => prisma.user.create({ data }),

  countAll: () => prisma.user.count(),

  registerFailedLogin: (id: string, attempts: number, lockedUntil: Date | null) =>
    prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    }),

  registerSuccessfulLogin: (id: string) =>
    prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),

  list: (params: { skip?: number; take?: number } = {}) =>
    prisma.user.findMany({
      skip: params.skip,
      take: params.take ?? 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { tradingAccounts: true, subscriptions: true } },
      },
    }),
};
