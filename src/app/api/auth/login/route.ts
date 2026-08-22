import { clientIp, handler, ok } from "@/lib/api";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation/auth";
import { authenticate, startSession } from "@/services/auth.service";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  const body = await req.json();
  const input = loginSchema.parse(body);

  // Rate limit per IP and per account so one attacker cannot lock everyone out
  // and one IP cannot spray many accounts.
  await enforceRateLimit("login:ip", ip, RateLimits.login);
  await enforceRateLimit("login:email", input.email, RateLimits.login);

  const meta = { ipAddress: ip, userAgent: req.headers.get("user-agent") ?? undefined };
  const user = await authenticate(input, meta);
  const { token, expiresAt } = await startSession(user.id, meta);
  await setSessionCookie(token, expiresAt);

  return ok({ user });
});
