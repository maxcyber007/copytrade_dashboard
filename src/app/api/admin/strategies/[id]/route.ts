import { clientIp, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { strategySchema } from "@/lib/validation/strategy";
import { deleteStrategy, updateStrategy } from "@/services/strategy.service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = strategySchema.parse(await req.json());

  const strategy = await updateStrategy(id, input, { userId: admin.id, isAdmin: true }, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ strategy });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  await deleteStrategy(id, { userId: admin.id, isAdmin: true }, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ deleted: true });
});
