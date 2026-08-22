import type { ProviderStatus } from "@prisma/client";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { providerRepository } from "@/repositories/provider.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;

export const GET = handler(async (req: Request) => {
  await requireAdmin();

  const requested = new URL(req.url).searchParams.get("status");
  const status = STATUSES.includes(requested as ProviderStatus) ? (requested as ProviderStatus) : undefined;

  const [providers, counts] = await Promise.all([
    providerRepository.listForAdmin({ status }),
    providerRepository.countByStatus(),
  ]);

  return ok({
    providers,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
});
