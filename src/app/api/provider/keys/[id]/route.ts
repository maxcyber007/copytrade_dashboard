import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { revokeStrategyApiKey } from "@/services/strategy.service";

export const runtime = "nodejs";

export const DELETE = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  await revokeStrategyApiKey(id, { userId: user.id, isAdmin: user.role === "ADMIN" }, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ revoked: true });
});
