import { cookies } from "next/headers";
import { clientIp, handler, ok } from "@/lib/api";
import { SESSION_COOKIE, requireUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validation/profile";
import { changePassword } from "@/services/profile.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  // Guessing the current password is a credential attack, so it is rate
  // limited the same way the reset flow is.
  await enforceRateLimit("profile:password", user.id, RateLimits.passwordReset);

  const input = changePasswordSchema.parse(await req.json());
  const store = await cookies();

  await changePassword(user.id, input, store.get(SESSION_COOKIE)?.value, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ changed: true });
});
