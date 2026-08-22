import { clientIp, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { providerReviewSchema } from "@/lib/validation/provider";
import { reviewProviderApplication } from "@/services/provider.service";

export const runtime = "nodejs";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const input = providerReviewSchema.parse(await req.json());
  const provider = await reviewProviderApplication(id, admin.id, input, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ provider });
});
