import { Eye } from "lucide-react";
import Link from "next/link";
import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [{ overview }, t] = await Promise.all([loadPageData("admin/dashboard"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.overviewTitle}</h1>
        <p className="text-sm text-muted">{t.admin.overviewSubtitle}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">{t.admin.groupMembers}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t.admin.totalMembers} value={overview.totalMembers} />
          <StatCard label={t.admin.activeMembers} value={overview.activeMembers} />
          <StatCard label={t.admin.tradingAccounts} value={overview.totalAccounts} />
          <StatCard label={t.admin.connected} value={overview.connectedAccounts} tone="gold" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">{t.admin.groupStrategies}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t.admin.strategies} value={overview.totalStrategies} />
          <StatCard label={t.admin.activeStrategies} value={overview.activeStrategies} />
          <StatCard
            label={t.admin.pendingApplications}
            value={overview.pendingProviders}
            tone={overview.pendingProviders > 0 ? "gold" : "neutral"}
            hint={overview.pendingProviders > 0 ? t.admin.waitingReview : undefined}
          />
          <StatCard label={t.admin.approvedProviders} value={overview.approvedProviders} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">{t.admin.groupExecution}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t.admin.copyingAccounts} value={overview.copyingAccounts} />
          <StatCard label={t.admin.copyAttempts} value={overview.totalCopyTrades} />
          <StatCard label={t.admin.successful} value={overview.successfulCopies} tone="profit" />
          <StatCard
            label={t.admin.failed}
            value={overview.failedCopies}
            tone={overview.failedCopies > 0 ? "loss" : "neutral"}
          />
        </div>
      </section>

      {overview.unresolvedErrors > 0 && (
        <Card>
          <CardHeader
            title={t.admin.unresolvedErrors.replace("{count}", String(overview.unresolvedErrors))}
            subtitle={t.admin.unresolvedSubtitle}
            action={
              <Link href="/admin/errors">
                <Button size="sm" variant="secondary">
                  <Eye className="h-4 w-4" />
                  {t.admin.review}
                </Button>
              </Link>
            }
          />
        </Card>
      )}
    </div>
  );
}
