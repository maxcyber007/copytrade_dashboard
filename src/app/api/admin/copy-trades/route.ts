import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { copyTradeRepository } from "@/repositories/copy-trade.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  const [trades, counts] = await Promise.all([
    copyTradeRepository.listForAdmin(),
    copyTradeRepository.countByStatus(),
  ]);

  return ok({ trades, counts: Object.fromEntries(counts.map((row) => [row.status, row._count])) });
});
