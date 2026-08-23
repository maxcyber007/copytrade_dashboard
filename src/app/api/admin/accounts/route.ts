import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { accountRepository } from "@/repositories/account.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  return ok({ accounts: await accountRepository.listForAdmin() });
});
