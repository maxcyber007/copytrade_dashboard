import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { copyTradeRepository } from "@/repositories/copy-trade.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const take = Math.min(Number(searchParams.get("take") ?? 50), 200);
  const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);

  const [trades, total] = await Promise.all([
    copyTradeRepository.listForUser(user.id, { take, skip }),
    copyTradeRepository.countForUser(user.id),
  ]);

  return ok({ trades, total });
});
