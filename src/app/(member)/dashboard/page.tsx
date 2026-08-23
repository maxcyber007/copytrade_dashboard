import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getMemberOverview } from "@/services/dashboard.service";
import { listAccounts } from "@/services/account.service";
import { listSubscriptions } from "@/services/copy.service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCurrency, formatPercent, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [overview, accounts, subscriptions] = await Promise.all([
    getMemberOverview(user.id),
    listAccounts(user.id),
    listSubscriptions(user.id),
  ]);

  if (!overview.hasAccounts) {
    return (
      <div className="space-y-6">
        <Header email={user.email} />
        <Card>
          <CardHeader title="Account overview" subtitle="Live metrics appear once a trading account is connected." />
          <EmptyState
            title="No trading account connected yet"
            description="Add and connect an MT4 or MT5 account to see balance, equity, open trades and copy status here."
            action={
              <Link href="/account">
                <Button>Add a trading account</Button>
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
      <Header email={user.email} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Balance" value={formatCurrency(overview.balance, overview.currency)} />
        <StatCard label="Equity" value={formatCurrency(overview.equity, overview.currency)} />
        <StatCard
          label="Floating P/L"
          value={formatCurrency(overview.floatingPnl, overview.currency)}
          tone={pnlTone(overview.floatingPnl)}
        />
        <StatCard
          label="Today P/L"
          value={formatCurrency(overview.todayPnl, overview.currency)}
          tone={pnlTone(overview.todayPnl)}
          hint="From copied trades recorded today"
        />
        <StatCard label="Drawdown" value={formatPercent(overview.drawdownPct)} />
        <StatCard label="Open trades" value={overview.openTrades} />
        <StatCard
          label="Connected accounts"
          value={`${overview.connectedAccounts} / ${overview.totalAccounts}`}
        />
        <StatCard label="Copying" value={overview.copyingSubscriptions} tone="gold" hint="Active subscriptions" />
      </div>

      <Card>
        <CardHeader
          title="Trading accounts"
          subtitle={
            overview.lastSyncAt
              ? `Last synchronised ${overview.lastSyncAt.toLocaleString()}`
              : "Not synchronised yet"
          }
          action={
            <Link href="/account">
              <Button variant="secondary" size="sm">
                Manage
              </Button>
            </Link>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Platform</Th>
              <Th>Connection</Th>
              <Th>Copy</Th>
              <Th className="text-right">Balance</Th>
              <Th className="text-right">Equity</Th>
              <Th className="text-right">Open</Th>
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
          title="Strategy subscriptions"
          subtitle="Copy status per strategy"
          action={
            <Link href="/strategies">
              <Button variant="secondary" size="sm">
                Browse strategies
              </Button>
            </Link>
          }
        />
        {subscriptions.length === 0 ? (
          <EmptyState
            title="Not following any strategy yet"
            description="Pick a strategy, set your risk, and start copying."
            action={
              <Link href="/strategies">
                <Button>Browse strategies</Button>
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

function Header({ email }: { email: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-sm text-muted">Signed in as {email}</p>
    </div>
  );
}
