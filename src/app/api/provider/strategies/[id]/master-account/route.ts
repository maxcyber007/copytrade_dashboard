import { z } from "zod";
import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setStrategyMasterAccount } from "@/services/strategy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Null unlinks the account, and the strategy goes back to expecting an EA. */
const schema = z.object({ accountId: z.string().trim().min(1).nullable() });

export const PUT = handler(async (req: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const { accountId } = schema.parse(await req.json());

  const strategy = await setStrategyMasterAccount(
    id,
    accountId,
    { userId: user.id, isAdmin: user.role === "ADMIN" },
    { ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined },
  );

  return ok({ strategy: { id: strategy.id, masterAccountId: strategy.masterAccountId } });
});
