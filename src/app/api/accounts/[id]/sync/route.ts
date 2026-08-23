import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { getOpenPositions, syncAccount } from "@/services/account.service";

export const runtime = "nodejs";

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await enforceRateLimit("account:sync", user.id, RateLimits.api);

  const account = await syncAccount(id, user.id);
  const positions = await getOpenPositions(id, user.id);

  return ok({ account, positions });
});
