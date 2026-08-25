import { Compass, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCurrency, formatPercent, toNumber } from "@/lib/utils";
import { LiveUpdates } from "@/components/live/live-updates";
import { getDictionary } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [{ overview, accounts, subscriptions }, t] = await Promise.all([
    loadPageData("dashboard"),
    getDictionary(),
  ]);

  if (!overview.hasAccounts) {
    return (
      <div className="space-y-6">
        <Header email={user.email} t={t} />
        <Card>
          <CardHeader title={t.dashboard.overviewTitle} subtitle={t.dashboard.overviewSubtitle} />
          <EmptyState
            title={t.dashboard.noAccountTitle}
            description={t.dashboard.noAccountBody}
            action={
              <Link href="/account">
                <Button>
                  <Plus className="h-4 w-4" />
                  {t.dashboard.addAccount}
                </Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const pnlTone = (value: number) => (value > 0 ? "profit" : value < 0 ? "loss" : "neutral");

  return (
    <div className="space-y-6">
      <Header email={user.email} t={t} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.dashboard.balance} value={formatCurrency(overview.balance, overview.currency)} />
        <StatCard label={t.dashboard.equity} value={formatCurrency(overview.equity, overview.currency)} />
        <StatCard
          label={t.dashboard.floatingPnl}
          value={formatCurrency(overview.floatingPnl, overview.currency)}
          tone={pnlTone(overview.floatingPnl)}
        />
        <StatCard
          label={t.dashboard.todayPnl}
          value={formatCurrency(overview.todayPnl, overview.currency)}
          tone={pnlTone(overview.todayPnl)}
          hint={t.dashboard.todayPnlHint}
        />
        <StatCard label={t.dashboard.drawdown} value={formatPercent(overview.drawdownPct)} />
        <StatCard label={t.dashboard.openTrades} value={overview.openTrades} />
        <StatCard
          label={t.dashboard.connectedAccounts}
          value={`${overview.connectedAccounts} / ${overview.totalAccounts}`}
        />
        <StatCard label={t.dashboard.copying} value={overview.copyingSubscriptions} tone="gold" hint={t.dashboard.copyingHint} />
      </div>

      <Card>
        <CardHeader
          title={t.dashboard.accountsTitle}
          subtitle={
            overview.lastSyncAt
              ? t.dashboard.lastSync.replace("{time}", overview.lastSyncAt.toLocaleString())
              : t.dashboard.notSynced
          }
          action={
            <Link href="/account">
              <Button variant="secondary" size="sm">
                <SlidersHorizontal className="h-4 w-4" />
                {t.dashboard.manage}
              </Button>
            </Link>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>{t.dashboard.thAccount}</Th>
              <Th>{t.dashboard.thPlatform}</Th>
              <Th>{t.dashboard.thConnection}</Th>
              <Th>{t.dashboard.thCopy}</Th>
              <Th className="text-right">{t.dashboard.thBalance}</Th>
              <Th className="text-right">{t.dashboard.thEquity}</Th>
              <Th className="text-right">{t.dashboard.thOpen}</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <Td>
                  <span className="font-medium">{account.label}</span>
                  <span className="block text-xs text-muted">
                    {account.broker} · {account.login}
                  </span>
                </Td>
                <Td>
                  {account.platform}
                  <span className="block text-xs text-muted">{account.positionMode}</span>
                </Td>
                <Td>
                  <StatusBadge status={account.connectionStatus} />
                </Td>
                <Td>
                  <StatusBadge status={account.copyStatus} />
                </Td>
                <Td className="text-right tabular-nums">
                  {formatCurrency(toNumber(account.balance), account.currency)}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatCurrency(toNumber(account.equity), account.currency)}
                </Td>
                <Td className="text-right tabular-nums">{account.openTrades}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title={t.dashboard.subsTitle}
          subtitle={t.dashboard.subsSubtitle}
          action={
            <Link href="/strategies">
              <Button variant="secondary" size="sm">
                <Compass className="h-4 w-4" />
                {t.dashboard.browse}
              </Button>
            </Link>
          }
        />
        {subscriptions.length === 0 ? (
          <EmptyState
            title={t.dashboard.noSubsTitle}
            description={t.dashboard.noSubsBody}
            action={
              <Link href="/strategies">
                <Button>
                  <Compass className="h-4 w-4" />
                  {t.dashboard.browse}
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {subscriptions.map((subscription) => (
              <li key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3" style={{ background: "var(--bg)" }}>
                <div>
                  <p className="font-medium">{subscription.strategy.name}</p>
                  <p className="text-xs text-muted">
                    {subscription.account.label} · {subscription.copySettings?.lotMode ?? "MULTIPLIER"}
                  </p>
                </div>
                <StatusBadge status={subscription.copyStatus} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Header({ email, t }: { email: string; t: Dictionary }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.title}</h1>
        <p className="text-sm text-muted">{t.dashboard.signedInAs.replace("{email}", email)}</p>
      </div>
      {/* Copies land on the account without a page reload. */}
      <LiveUpdates />
    </div>
  );
}
