import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminOverview } from "@/services/dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  return ok({ overview: await getAdminOverview() });
});
