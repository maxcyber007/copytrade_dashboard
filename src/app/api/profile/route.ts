import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { updateProfileSchema } from "@/lib/validation/profile";
import { getProfile, updateProfile } from "@/services/profile.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  return ok(await getProfile(user.id));
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const input = updateProfileSchema.parse(await req.json());

  return ok(
    await updateProfile(user.id, input, {
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    }),
  );
});
