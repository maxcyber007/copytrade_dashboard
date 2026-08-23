import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { copyControlSchema } from "@/lib/validation/copy";
import { startCopying } from "@/services/copy.service";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { subscriptionId } = copyControlSchema.parse(await req.json());

  const subscription = await startCopying(subscriptionId, user.id, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ subscription });
});
