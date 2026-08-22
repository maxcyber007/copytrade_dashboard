import { requireAdmin } from "@/lib/auth/session";
import { providerRepository } from "@/repositories/provider.repository";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProviderReviewActions } from "@/components/admin/provider-review-actions";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  await requireAdmin();

  const [providers, counts] = await Promise.all([
    providerRepository.listForAdmin({ take: 100 }),
    providerRepository.countByStatus(),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signal providers</h1>
        <p className="text-sm text-muted">
          Review applications. Only approved providers can publish a live strategy.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const).map((status) => (
          <Card key={status}>
            <p className="text-xs uppercase tracking-wide text-muted">{status}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{byStatus[status] ?? 0}</p>
          </Card>
        ))}
      </div>

      {providers.length === 0 ? (
        <EmptyState title="No applications yet" description="Member applications to publish signals appear here." />
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold">{provider.displayName}</h2>
                    <StatusBadge status={provider.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {provider.user.email} · applied {provider.appliedAt.toLocaleDateString()} ·{" "}
                    {provider._count.strategies} {provider._count.strategies === 1 ? "strategy" : "strategies"}
                  </p>
                  {provider.headline && <p className="mt-3 text-sm">{provider.headline}</p>}
                  {provider.bio && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{provider.bio}</p>}
                  <p className="mt-3 text-sm text-muted tabular-nums">
                    Performance fee {String(provider.performanceFeePct)}% · Monthly $
                    {String(provider.subscriptionPriceMonthly)}
                    {provider.website ? ` · ${provider.website}` : ""}
                  </p>
                  {provider.reviewNote && (
                    <p className="mt-3 text-xs text-muted">Internal note: {provider.reviewNote}</p>
                  )}
                </div>

                <ProviderReviewActions providerId={provider.id} status={provider.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
