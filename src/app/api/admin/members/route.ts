import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { userRepository } from "@/repositories/user.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const take = Math.min(Number(searchParams.get("take") ?? 50), 200);
  const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);

  return ok({ members: await userRepository.list({ take, skip }) });
});
