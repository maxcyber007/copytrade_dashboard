import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getAccount, getOpenPositions, setAccountEnabled } from "@/services/account.service";
import { setAccountEnabledSchema } from "@/lib/validation/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const [account, positions] = await Promise.all([getAccount(id, user.id), getOpenPositions(id, user.id)]);
  return ok({ account, positions });
});

/**
 * Enables or disables the account.
 *
 * There is deliberately no DELETE: the provider account is created by this
 * platform, and removing our row would leave it provisioned and billed with
 * nothing pointing at it. Disabling undeploys it instead.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { enabled } = setAccountEnabledSchema.parse(await req.json());

  const account = await setAccountEnabled(id, user.id, enabled, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ account });
});
