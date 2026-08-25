import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DailyProfitChart } from "@/components/charts/daily-profit-chart";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const user = await requireUser();
  const [{ performance }, t] = await Promise.all([loadPageData("performance"), getDictionary()]);

  if (performance.totalTrades === 0) {
    return (
      <div className="space-y-6">
        <Header t={t} />
        <EmptyState
          title={t.perf.emptyTitle}
          description={t.perf.emptyBody}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header t={t} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.perf.totalProfit}
          value={formatCurrency(performance.totalProfit)}
          tone={performance.totalProfit >= 0 ? "profit" : "loss"}
        />
        <StatCard label={t.perf.totalTrades} value={performance.totalTrades} />
        <StatCard label={t.perf.winRate} value={formatPercent(performance.winRatePct)} />
        <StatCard
          label={t.perf.profitFactor}
          value={performance.profitFactor === null ? "—" : performance.profitFactor}
          hint={performance.profitFactor === null ? t.perf.noLosses : undefined}
        />
        <StatCard label={t.perf.averageWin} value={formatCurrency(performance.averageProfit)} tone="profit" />
        <StatCard label={t.perf.averageLoss} value={formatCurrency(performance.averageLoss)} tone="loss" />
        <StatCard label={t.perf.winsLosses} value={`${performance.wins} / ${performance.losses}`} />
        <StatCard
          label={t.perf.averageLatency}
          value={performance.averageLatencyMs === null ? "—" : `${performance.averageLatencyMs} ms`}
          hint={t.perf.latencyHint}
        />
      </div>

      <Card>
        <CardHeader title={t.perf.dailyProfit} subtitle={t.perf.dailyProfitSubtitle} />
        <DailyProfitChart data={performance.dailyProfit} />
      </Card>
    </div>
  );
}

function Header({ t }: { t: Dictionary }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t.perf.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.perf.subtitle}</p>
    </div>
  );
}
