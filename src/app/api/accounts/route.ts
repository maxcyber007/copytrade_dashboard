import { clientIp, created, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { createAccountSchema } from "@/lib/validation/account";
import { createAccount, listAccounts } from "@/services/account.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ accounts: await listAccounts(user.id) });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await enforceRateLimit("account:create", user.id, RateLimits.api);

  const input = createAccountSchema.parse(await req.json());
  const account = await createAccount(user.id, input, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return created({ account });
});
