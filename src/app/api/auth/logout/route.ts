import { clientIp, handler, ok } from "@/lib/api";
import { clearSessionCookie, getCurrentUser, revokeCurrentSession } from "@/lib/auth/session";
import { AuditAction, recordAudit } from "@/services/audit.service";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  const user = await getCurrentUser();
  await revokeCurrentSession();
  await clearSessionCookie();

  if (user) {
    await recordAudit({
      action: AuditAction.USER_LOGOUT,
      userId: user.id,
      resourceType: "User",
      resourceId: user.id,
      ipAddress: clientIp(req),
    });
  }

  return ok({ loggedOut: true });
});
