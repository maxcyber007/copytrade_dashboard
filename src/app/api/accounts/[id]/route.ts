import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteAccount, getAccount, getOpenPositions } from "@/services/account.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const [account, positions] = await Promise.all([getAccount(id, user.id), getOpenPositions(id, user.id)]);
  return ok({ account, positions });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  await deleteAccount(id, user.id, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ deleted: true });
});
