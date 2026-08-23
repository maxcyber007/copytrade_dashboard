import { clientIp, created, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { strategySchema } from "@/lib/validation/strategy";
import { createPlatformStrategy, listAllStrategies } from "@/services/strategy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  return ok({ strategies: await listAllStrategies() });
});

export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const input = strategySchema.parse(await req.json());

  const strategy = await createPlatformStrategy(admin.id, input, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return created({ strategy });
});
