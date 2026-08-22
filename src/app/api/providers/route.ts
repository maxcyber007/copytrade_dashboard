import { handler, ok } from "@/lib/api";
import { providerRepository } from "@/repositories/provider.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public marketplace listing — approved providers only, public fields only. */
export const GET = handler(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const take = Math.min(Number(searchParams.get("take") ?? 24), 50);
  const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);

  return ok({ providers: await providerRepository.listPublic({ take, skip }) });
});
