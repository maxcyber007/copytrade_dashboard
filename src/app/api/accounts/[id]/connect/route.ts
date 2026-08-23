import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { connectAccount } from "@/services/account.service";

export const runtime = "nodejs";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await enforceRateLimit("account:connect", user.id, RateLimits.api);

  const account = await connectAccount(id, user.id, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ account });
});
