import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { unsubscribe } from "@/services/copy.service";

export const runtime = "nodejs";

export const DELETE = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  await unsubscribe(id, user.id, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ unsubscribed: true });
});
