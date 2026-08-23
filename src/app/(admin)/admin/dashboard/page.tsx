import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminOverview } from "@/services/dashboard.service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const overview = await getAdminOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted">Platform-wide state, counted from the database.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Members and accounts</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total members" value={overview.totalMembers} />
          <StatCard label="Active members" value={overview.activeMembers} />
          <StatCard label="Trading accounts" value={overview.totalAccounts} />
          <StatCard label="Connected" value={overview.connectedAccounts} tone="gold" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Strategies and providers</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Strategies" value={overview.totalStrategies} />
          <StatCard label="Active strategies" value={overview.activeStrategies} />
          <StatCard
            label="Pending applications"
            value={overview.pendingProviders}
            tone={overview.pendingProviders > 0 ? "gold" : "neutral"}
            hint={overview.pendingProviders > 0 ? "Waiting for review" : undefined}
          />
          <StatCard label="Approved providers" value={overview.approvedProviders} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Copy execution</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Copying accounts" value={overview.copyingAccounts} />
          <StatCard label="Copy attempts" value={overview.totalCopyTrades} />
          <StatCard label="Successful" value={overview.successfulCopies} tone="profit" />
          <StatCard
            label="Failed"
            value={overview.failedCopies}
            tone={overview.failedCopies > 0 ? "loss" : "neutral"}
          />
        </div>
      </section>

      {overview.unresolvedErrors > 0 && (
        <Card>
          <CardHeader
            title={`${overview.unresolvedErrors} unresolved system error(s)`}
            subtitle="Technical detail is visible to administrators only."
            action={
              <Link href="/admin/errors">
                <Button size="sm" variant="secondary">
                  Review
                </Button>
              </Link>
            }
          />
        </Card>
      )}
    </div>
  );
}
