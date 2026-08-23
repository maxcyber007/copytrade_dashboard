import { requireUser } from "@/lib/auth/session";
import { getMemberPerformance } from "@/services/dashboard.service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DailyProfitChart } from "@/components/charts/daily-profit-chart";
import { formatCurrency, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const user = await requireUser();
  const performance = await getMemberPerformance(user.id);

  if (performance.totalTrades === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          title="No performance data yet"
          description="These figures are computed from your own copied trades. They appear once a strategy you follow has traded."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total profit"
          value={formatCurrency(performance.totalProfit)}
          tone={performance.totalProfit >= 0 ? "profit" : "loss"}
        />
        <StatCard label="Total trades" value={performance.totalTrades} />
        <StatCard label="Win rate" value={formatPercent(performance.winRatePct)} />
        <StatCard
          label="Profit factor"
          value={performance.profitFactor === null ? "—" : performance.profitFactor}
          hint={performance.profitFactor === null ? "No losing trades yet" : undefined}
        />
        <StatCard label="Average win" value={formatCurrency(performance.averageProfit)} tone="profit" />
        <StatCard label="Average loss" value={formatCurrency(performance.averageLoss)} tone="loss" />
        <StatCard label="Wins / losses" value={`${performance.wins} / ${performance.losses}`} />
        <StatCard
          label="Average latency"
          value={performance.averageLatencyMs === null ? "—" : `${performance.averageLatencyMs} ms`}
          hint="Master event to broker fill"
        />
      </div>

      <Card>
        <CardHeader title="Daily profit" subtitle="Realised profit per day from copied trades" />
        <DailyProfitChart data={performance.dailyProfit} />
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
      <p className="mt-1 text-sm text-muted">Computed from your recorded copy results only.</p>
    </div>
  );
}
