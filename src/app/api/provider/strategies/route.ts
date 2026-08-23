import { clientIp, created, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { strategySchema } from "@/lib/validation/strategy";
import { createProviderStrategy, listProviderStrategies } from "@/services/strategy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ strategies: await listProviderStrategies(user.id) });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const input = strategySchema.parse(await req.json());

  const strategy = await createProviderStrategy(user.id, input, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return created({ strategy });
});
