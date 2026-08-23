import { z } from "zod";
import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { changePlan } from "@/services/subscription.service";

export const runtime = "nodejs";

const bodySchema = z.object({ planId: z.string().min(1) });

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await enforceRateLimit("billing:change", user.id, RateLimits.api);

  const { planId } = bodySchema.parse(await req.json());
  const result = await changePlan(user.id, planId, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok(result);
});
