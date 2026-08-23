import { clientIp, created, handler } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { subscribeSchema } from "@/lib/validation/copy";
import { subscribe } from "@/services/copy.service";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await enforceRateLimit("copy:subscribe", user.id, RateLimits.api);

  const input = subscribeSchema.parse(await req.json());
  const subscription = await subscribe(user.id, input, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return created({ subscription });
});
