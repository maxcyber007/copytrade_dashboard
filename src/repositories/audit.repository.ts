import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const auditRepository = {
  create: (data: Prisma.AuditLogUncheckedCreateInput) => prisma.auditLog.create({ data }),

  list: (params: { skip?: number; take?: number; userId?: string; action?: string } = {}) =>
    prisma.auditLog.findMany({
      where: { userId: params.userId, action: params.action },
      skip: params.skip,
      take: params.take ?? 50,
      orderBy: { createdAt: "desc" },
    }),
};
