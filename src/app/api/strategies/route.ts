import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listPublicStrategies } from "@/services/strategy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireUser();
  return ok({ strategies: await listPublicStrategies() });
});
