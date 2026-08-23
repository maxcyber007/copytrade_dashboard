import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getPublicStrategy } from "@/services/strategy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await ctx.params;
  return ok({ strategy: await getPublicStrategy(id) });
});
