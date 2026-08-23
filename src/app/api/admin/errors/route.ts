import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Technical error detail is admin-only; members never see these payloads. */
export const GET = handler(async () => {
  await requireAdmin();
  const errors = await prisma.systemError.findMany({ take: 100, orderBy: { createdAt: "desc" } });
  return ok({ errors });
});
