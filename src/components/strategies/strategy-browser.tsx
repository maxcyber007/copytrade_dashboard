"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle, BadgeCheck, Check, HelpCircle, Pause, Play, Plus, Server, Square, Trash2 } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { formatPercent } from "@/lib/utils";
import { SubscribeDialog } from "./subscribe-dialog";
import { useT } from "@/components/i18n/locale-provider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { apiFetch } from "@/lib/api-client/browser";

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
  /** DEMO or LIVE, or null when the strategy publishes through a master EA. */
  masterAccountType: string | null;
  masterBroker: string | null;
  masterServer: string | null;
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
  const t = useT();
  const [dialogStrategy, setDialogStrategy] = useState<StrategyView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  async function control(subscriptionId: string, action: "start" | "pause" | "stop") {
    setBusy(`${subscriptionId}:${action}`);
    try {
      const res = await apiFetch(`/api/copy/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? t.browser.requestFailed);
      const done =
        action === "start"
          ? t.browser.copyingStarted
          : action === "pause"
            ? t.browser.copyingPaused
            : t.browser.copyingStopped;
      setToast({ message: done, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : t.browser.requestFailed, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe(subscriptionId: string, name: string) {
    if (!window.confirm(t.browser.unsubscribeConfirm.replace("{name}", name))) return;
    setBusy(`${subscriptionId}:delete`);
    try {
      const res = await apiFetch(`/api/copy/${subscriptionId}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? t.browser.requestFailed);
      setToast({ message: t.browser.unsubscribed, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : t.browser.requestFailed, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {subscriptions.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t.browser.yourSubscriptions}</h2>
          {subscriptions.map((subscription) => (
            <Card key={subscription.id}>
              <CardHeader
                title={subscription.strategyName}
                subtitle={`${subscription.accountLabel} · ${describeLot(subscription, t)}`}
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
                    <Pause className="h-4 w-4" />
                    {t.browser.pause}
                  </Button>
                ) : (
                  <Button size="sm" loading={busy === `${subscription.id}:start`} onClick={() => control(subscription.id, "start")}>
                    <Play className="h-4 w-4" />
                    {t.browser.startCopying}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === `${subscription.id}:stop`}
                  onClick={() => control(subscription.id, "stop")}
                >
                  <Square className="h-4 w-4" />
                  {t.browser.stop}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy === `${subscription.id}:delete`}
                  onClick={() => unsubscribe(subscription.id, subscription.strategyName)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t.browser.unsubscribe}
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t.browser.available}</h2>

        {strategies.length === 0 ? (
          <EmptyState
            title={t.browser.emptyTitle}
            description={t.browser.emptyBody}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {strategies.map((strategy) => {
              const subscribed = subscriptions.some((s) => s.strategyId === strategy.id);
              return (
                <Card key={strategy.id}>
                  <CardHeader
                    title={strategy.name}
                    subtitle={`${strategy.providerName} · ${strategy.code} · ${t.browser.masterOn} ${strategy.masterPlatform}`}
                    action={<StatusBadge status={strategy.status} />}
                  />
                  <SourceBadges strategy={strategy} t={t} />

                  {strategy.description && (
                    <p className="mb-4 text-sm leading-relaxed text-muted">{strategy.description}</p>
                  )}

                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Metric label={t.browser.metricReturn} value={formatPercent(strategy.totalReturnPct)} />
                    <Metric label={t.browser.metricMaxDd} value={formatPercent(strategy.maxDrawdownPct)} />
                    <Metric label={t.browser.metricWinRate} value={formatPercent(strategy.winRatePct)} />
                    <Metric label={t.browser.metricMembers} value={String(strategy.memberCount)} />
                  </dl>

                  <p className="mt-4 text-xs text-muted">
                    {strategy.performanceFeePct > 0 || strategy.subscriptionPriceMonthly > 0
                      ? t.browser.providerTerms.replace("{fee}", String(strategy.performanceFeePct)) +
                        (strategy.subscriptionPriceMonthly > 0
                          ? t.browser.perMonthSuffix.replace(
                              "{price}",
                              String(strategy.subscriptionPriceMonthly),
                            )
                          : "")
                      : t.browser.publishedFree}
                  </p>
                  {strategy.totalTrades === 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {t.browser.noHistory}
                    </p>
                  )}

                  <div className="mt-5">
                    <Button
                      size="sm"
                      disabled={subscribed || strategy.status !== "ACTIVE"}
                      onClick={() => setDialogStrategy(strategy)}
                    >
                      {subscribed ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {subscribed
                        ? t.browser.alreadySubscribed
                        : strategy.status === "ACTIVE"
                          ? t.browser.subscribe
                          : t.browser.notAccepting}
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

/**
 * Where the strategy's trades actually come from.
 *
 * A demo source is called out rather than merely stated: copying it moves real
 * money on the strength of trades that never met a real fill, and that is the
 * kind of thing a member should not have to go looking for.
 */
function SourceBadges({ strategy, t }: { strategy: StrategyView; t: Dictionary }) {
  const isLive = strategy.masterAccountType === "LIVE";
  const isDemo = strategy.masterAccountType === "DEMO";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      {isLive && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
          style={{
            background: "color-mix(in srgb, var(--candle-up) 16%, transparent)",
            color: "var(--candle-up)",
          }}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          {t.browser.sourceLive}
        </span>
      )}

      {isDemo && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
          style={{ background: "var(--gold-glow)", color: "var(--gold)" }}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {t.browser.sourceDemo}
        </span>
      )}

      {!isLive && !isDemo && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ border: "1px solid var(--panel-border)", color: "var(--text-muted)" }}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {t.browser.sourceUnknown}
        </span>
      )}

      {strategy.masterServer && (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Server className="h-3.5 w-3.5" />
          <span className="font-mono">{strategy.masterServer}</span>
          {strategy.masterBroker && <span>· {strategy.masterBroker}</span>}
        </span>
      )}
    </div>
  );
}

function describeLot(subscription: SubscriptionView, t: Dictionary): string {
  switch (subscription.lotMode) {
    case "FIXED":
      return t.browser.lotFixed.replace("{lot}", String(subscription.fixedLot));
    case "BALANCE_RATIO":
      return t.browser.lotBalance;
    case "RISK_PERCENT":
      return t.browser.lotRisk.replace("{percent}", String(subscription.riskPercent));
    default:
      return t.browser.lotMultiplier.replace("{value}", String(subscription.multiplier));
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
