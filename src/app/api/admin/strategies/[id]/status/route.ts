import { clientIp, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { strategyStatusSchema } from "@/lib/validation/strategy";
import { setStrategyStatus } from "@/services/strategy.service";

export const runtime = "nodejs";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = strategyStatusSchema.parse(await req.json());

  const strategy = await setStrategyStatus(id, input, { userId: admin.id, isAdmin: true }, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ strategy });
});
