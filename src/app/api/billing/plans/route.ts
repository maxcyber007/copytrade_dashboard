import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getEffectivePlan, listPlans } from "@/services/subscription.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  const [plans, effective] = await Promise.all([listPlans(user.id), getEffectivePlan(user.id)]);
  return ok({ plans, effectivePlan: { tier: effective.tier, name: effective.name } });
});
