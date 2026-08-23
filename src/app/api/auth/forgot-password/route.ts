import { clientIp, handler, ok } from "@/lib/api";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/services/password-reset.service";

export const runtime = "nodejs";

/**
 * Always answers the same way. Confirming whether an address is registered
 * would turn this unauthenticated form into a user-enumeration oracle.
 */
export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  const { email } = forgotPasswordSchema.parse(await req.json());

  await enforceRateLimit("password-reset:ip", ip, RateLimits.passwordReset);
  await enforceRateLimit("password-reset:email", email, RateLimits.passwordReset);

  await requestPasswordReset(email, { ipAddress: ip, userAgent: req.headers.get("user-agent") ?? undefined });

  return ok({ sent: true });
});
