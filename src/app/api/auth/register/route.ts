import { clientIp, created, handler } from "@/lib/api";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation/auth";
import { registerUser, startSession } from "@/services/auth.service";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  await enforceRateLimit("register", ip, RateLimits.register);

  const input = registerSchema.parse(await req.json());
  const meta = { ipAddress: ip, userAgent: req.headers.get("user-agent") ?? undefined };

  const user = await registerUser(input, meta);
  const { token, expiresAt } = await startSession(user.id, meta);
  await setSessionCookie(token, expiresAt);

  return created({ user });
});
