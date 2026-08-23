"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import { formatPercent } from "@/lib/utils";
import { SubscribeDialog } from "./subscribe-dialog";

export type StrategyView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  masterPlatform: string;
  ownerType: string;
  providerName: string;
  performanceFeePct: number;
  subscriptionPriceMonthly: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRatePct: number;
  totalTrades: number;
  memberCount: number;
};

export type AccountOption = { id: string; label: string; platform: string; connectionStatus: string };

export type SubscriptionView = {
  id: string;
  strategyId: string;
  strategyName: string;
  accountId: string;
  accountLabel: string;
  copyStatus: string;
  lotMode: string;
  multiplier: number;
  fixedLot: number;
  riskPercent: number;
  maxOpenTrades: number;
  maxDrawdownPct: number;
};

export function StrategyBrowser({
  strategies,
  accounts,
  subscriptions,
}: {
  strategies: StrategyView[];
  accounts: AccountOption[];
  subscriptions: SubscriptionView[];
}) {
  const router = useRouter();
  const [dialogStrategy, setDialogStrategy] = useState<StrategyView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  async function control(subscriptionId: string, action: "start" | "pause" | "stop") {
    setBusy(`${subscriptionId}:${action}`);
    try {
      const res = await fetch(`/api/copy/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Request failed");
      setToast({ message: `Copying ${action === "start" ? "started" : `${action}d`}`, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe(subscriptionId: string, name: string) {
    if (!window.confirm(`Unsubscribe from "${name}"?`)) return;
    setBusy(`${subscriptionId}:delete`);
    try {
      const res = await fetch(`/api/copy/${subscriptionId}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Request failed");
      setToast({ message: "Unsubscribed", tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {subscriptions.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Your subscriptions</h2>
          {subscriptions.map((subscription) => (
            <Card key={subscription.id}>
              <CardHeader
                title={subscription.strategyName}
                subtitle={`${subscription.accountLabel} · ${describeLot(subscription)}`}
                action={<StatusBadge status={subscription.copyStatus} />}
              />
              <div className="flex flex-wrap gap-2">
                {subscription.copyStatus === "COPYING" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === `${subscription.id}:pause`}
                    onClick={() => control(subscription.id, "pause")}
                  >
                    Pause
                  </Button>
                ) : (
                  <Button size="sm" loading={busy === `${subscription.id}:start`} onClick={() => control(subscription.id, "start")}>
                    Start copying
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === `${subscription.id}:stop`}
                  onClick={() => control(subscription.id, "stop")}
                >
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy === `${subscription.id}:delete`}
                  onClick={() => unsubscribe(subscription.id, subscription.strategyName)}
                >
                  Unsubscribe
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Available strategies</h2>

        {strategies.length === 0 ? (
          <EmptyState
            title="No strategies published yet"
            description="Published strategies from the platform and approved providers appear here."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {strategies.map((strategy) => {
              const subscribed = subscriptions.some((s) => s.strategyId === strategy.id);
              return (
                <Card key={strategy.id}>
                  <CardHeader
                    title={strategy.name}
                    subtitle={`${strategy.providerName} · ${strategy.code} · master on ${strategy.masterPlatform}`}
                    action={<StatusBadge status={strategy.status} />}
                  />
                  {strategy.description && (
                    <p className="mb-4 text-sm leading-relaxed text-muted">{strategy.description}</p>
                  )}

                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Metric label="Return" value={formatPercent(strategy.totalReturnPct)} />
                    <Metric label="Max DD" value={formatPercent(strategy.maxDrawdownPct)} />
                    <Metric label="Win rate" value={formatPercent(strategy.winRatePct)} />
                    <Metric label="Members" value={String(strategy.memberCount)} />
                  </dl>

                  <p className="mt-4 text-xs text-muted">
                    {strategy.performanceFeePct > 0 || strategy.subscriptionPriceMonthly > 0
                      ? `Provider terms: ${strategy.performanceFeePct}% performance fee${
                          strategy.subscriptionPriceMonthly > 0
                            ? ` · $${strategy.subscriptionPriceMonthly}/month`
                            : ""
                        }`
                      : "Published free by the provider"}
                  </p>
                  {strategy.totalTrades === 0 && (
                    <p className="mt-1 text-xs text-muted">
                      No trade history yet — performance figures start at zero until this strategy trades.
                    </p>
                  )}

                  <div className="mt-5">
                    <Button
                      size="sm"
                      disabled={subscribed || strategy.status !== "ACTIVE"}
                      onClick={() => setDialogStrategy(strategy)}
                    >
                      {subscribed ? "Already subscribed" : strategy.status === "ACTIVE" ? "Subscribe" : "Not accepting"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {dialogStrategy && (
        <SubscribeDialog
          strategy={dialogStrategy}
          accounts={accounts}
          onClose={() => setDialogStrategy(null)}
          onDone={(message, tone) => {
            setDialogStrategy(null);
            setToast({ message, tone });
            router.refresh();
          }}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function describeLot(subscription: SubscriptionView): string {
  switch (subscription.lotMode) {
    case "FIXED":
      return `Fixed ${subscription.fixedLot} lot`;
    case "BALANCE_RATIO":
      return "Proportional to balance";
    case "RISK_PERCENT":
      return `Risk ${subscription.riskPercent}% per trade`;
    default:
      return `Multiplier ×${subscription.multiplier}`;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
