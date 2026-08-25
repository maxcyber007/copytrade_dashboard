import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProviderReviewActions } from "@/components/admin/provider-review-actions";
import { getDictionary } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  await requireAdmin();

  const [{ providers, counts }, t] = await Promise.all([
    loadPageData("admin/providers"),
    getDictionary(),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.providersTitle}</h1>
        <p className="text-sm text-muted">
          {t.admin.providersSubtitle}
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
        <EmptyState title={t.admin.noApplications} description={t.admin.noApplicationsBody} />
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
                    {provider.user.email} · {t.admin.applied}{" "}
                    {formatDate(provider.appliedAt)} · {provider._count.strategies}{" "}
                    {provider._count.strategies === 1 ? t.admin.strategyOne : t.admin.strategyMany}
                  </p>
                  {provider.headline && <p className="mt-3 text-sm">{provider.headline}</p>}
                  {provider.bio && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{provider.bio}</p>}
                  <p className="mt-3 text-sm text-muted tabular-nums">
                    {t.admin.performanceFeeLabel} {String(provider.performanceFeePct)}% · {t.admin.monthlyLabel} $
                    {String(provider.subscriptionPriceMonthly)}
                    {provider.website ? ` · ${provider.website}` : ""}
                  </p>
                  {provider.reviewNote && (
                    <p className="mt-3 text-xs text-muted">{t.admin.internalNote} {provider.reviewNote}</p>
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
