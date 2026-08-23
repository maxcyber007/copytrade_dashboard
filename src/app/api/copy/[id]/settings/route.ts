import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { updateCopySettings } from "@/services/copy.service";

export const runtime = "nodejs";

export const PUT = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const settings = await updateCopySettings(id, user.id, await req.json(), {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ settings });
});
