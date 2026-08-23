import { clientIp, handler, ok } from "@/lib/api";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { completePasswordReset, isResetTokenValid } from "@/services/password-reset.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets the page tell the member the link is dead before asking for a password. */
export const GET = handler(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return ok({ valid: token.length >= 20 && (await isResetTokenValid(token)) });
});

export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  await enforceRateLimit("password-reset:complete", ip, RateLimits.passwordReset);

  const { token, password } = resetPasswordSchema.parse(await req.json());
  await completePasswordReset(token, password, {
    ipAddress: ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ reset: true });
});
