import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { searchKnownServers } from "@/lib/metaapi-servers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Broker/server lookup for the add-account form.
 *
 * Proxied rather than called from the browser: the MetaApi token must never
 * leave the server. Signed-in only and rate limited, because it is a
 * keystroke-driven endpoint that spends our provider quota.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  await enforceRateLimit("brokers:search", user.id, RateLimits.api);

  const url = new URL(req.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  const platform = url.searchParams.get("platform") === "MT4" ? "MT4" : "MT5";

  // MetaApi needs something to match on; an empty query would just burn a call.
  if (query.length < 2) return ok({ results: [] });

  return ok({ results: await searchKnownServers(platform, query) });
});
