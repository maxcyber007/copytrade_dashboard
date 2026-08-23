import { clientIp, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { adminUserDeleteSchema, adminUserUpdateSchema } from "@/lib/validation/admin-user";
import { deleteMember, getDeletionBlockers, getMemberDetail, updateMember } from "@/services/admin-user.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Detail plus anything that would block deletion, so the UI can explain it. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;

  const [member, blockers] = await Promise.all([getMemberDetail(id), getDeletionBlockers(id)]);
  return ok({ member, deletionBlockers: blockers });
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const input = adminUserUpdateSchema.parse(await req.json());
  const member = await updateMember(id, input, { id: admin.id }, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ member });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  // The email is typed by the admin and must match: deletion cascades to the
  // member's accounts, subscriptions and copy history.
  const { confirmEmail } = adminUserDeleteSchema.parse(await req.json());

  await deleteMember(id, confirmEmail, { id: admin.id }, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ deleted: true });
});
