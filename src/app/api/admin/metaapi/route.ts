import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getMetaApiUsage } from "@/services/metaapi-usage.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the admin page to keep the figures live. */
export const GET = handler(async () => {
  await requireAdmin();
  return ok(await getMetaApiUsage());
});
