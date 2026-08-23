import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listSubscriptions } from "@/services/copy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ subscriptions: await listSubscriptions(user.id) });
});
