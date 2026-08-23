import { clientIp, created, handler } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { issueStrategyApiKey } from "@/services/strategy.service";

export const runtime = "nodejs";

const bodySchema = z.object({ label: z.string().trim().min(1).max(40).default("Master EA") });

/**
 * Issues master EA credentials. The secret is in this response and nowhere
 * else — it cannot be read back later, only replaced.
 */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { label } = bodySchema.parse(await req.json().catch(() => ({})));

  const key = await issueStrategyApiKey(id, { userId: user.id, isAdmin: user.role === "ADMIN" }, label, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return created({ key });
});
