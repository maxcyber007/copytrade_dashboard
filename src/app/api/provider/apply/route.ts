import { clientIp, created, handler, ok } from "@/lib/api";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { providerApplicationSchema } from "@/lib/validation/provider";
import { applyAsProvider, getOwnProviderProfile } from "@/services/provider.service";

export const runtime = "nodejs";

/** The applicant's own view of their application, including any review reason. */
export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ provider: await getOwnProviderProfile(user.id) });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const ip = clientIp(req);
  await enforceRateLimit("provider:apply", user.id, RateLimits.providerApply);

  const input = providerApplicationSchema.parse(await req.json());
  const provider = await applyAsProvider(user.id, input, {
    ipAddress: ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return created({ provider });
});
