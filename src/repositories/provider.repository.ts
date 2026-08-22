import type { Prisma, ProviderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Fields safe to expose to any member browsing the marketplace. */
export const publicProviderSelect = {
  id: true,
  displayName: true,
  slug: true,
  headline: true,
  bio: true,
  website: true,
  country: true,
  yearsTrading: true,
  performanceFeePct: true,
  subscriptionPriceMonthly: true,
  currency: true,
  totalStrategies: true,
  totalSubscribers: true,
  createdAt: true,
} satisfies Prisma.ProviderProfileSelect;

export const providerRepository = {
  findByUserId: (userId: string) => prisma.providerProfile.findUnique({ where: { userId } }),

  findBySlug: (slug: string) =>
    prisma.providerProfile.findFirst({
      where: { slug, status: "APPROVED" },
      select: publicProviderSelect,
    }),

  displayNameTaken: (displayName: string, slug: string) =>
    prisma.providerProfile.findFirst({
      where: { OR: [{ displayName }, { slug }] },
      select: { id: true },
    }),

  create: (data: Prisma.ProviderProfileUncheckedCreateInput) => prisma.providerProfile.create({ data }),

  update: (id: string, data: Prisma.ProviderProfileUncheckedUpdateInput) =>
    prisma.providerProfile.update({ where: { id }, data }),

  findById: (id: string) => prisma.providerProfile.findUnique({ where: { id } }),

  listPublic: (params: { skip?: number; take?: number } = {}) =>
    prisma.providerProfile.findMany({
      where: { status: "APPROVED" },
      select: publicProviderSelect,
      skip: params.skip,
      take: params.take ?? 24,
      orderBy: [{ totalSubscribers: "desc" }, { createdAt: "desc" }],
    }),

  listForAdmin: (params: { status?: ProviderStatus; skip?: number; take?: number } = {}) =>
    prisma.providerProfile.findMany({
      where: { status: params.status },
      skip: params.skip,
      take: params.take ?? 50,
      orderBy: { appliedAt: "asc" },
      include: {
        user: { select: { id: true, email: true, name: true, createdAt: true } },
        _count: { select: { strategies: true } },
      },
    }),

  countByStatus: () => prisma.providerProfile.groupBy({ by: ["status"], _count: true }),
};
