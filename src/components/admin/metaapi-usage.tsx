"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, TrendingDown, Wallet } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td, Th } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

type Usage = {
  balance: { amount: number; trialAmount: number; advanceAmount: number } | null;
  balanceError: string | null;
  deployedAccounts: number;
  breakdown: { state: string; count: number }[];
  burnPerDay: number | null;
  daysRemaining: number | null;
  projectedDepletion: string | null;
  windowHours: number | null;
  lowBalance: boolean;
  lowBalanceThreshold: number;
  lowRunwayDays: number;
  funding: { amount: number; balanceAfter: number; at: string }[];
  measuredAt: string;
};

/**
 * MetaApi has no payment API, so topping up happens on their site.
 *
 * That is also the right place for it: card details belong with the company
 * charging the card, not proxied through this dashboard.
 */
const TOP_UP_URL = "https://app.metaapi.cloud/billing";

const POLL_MS = 30_000;

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value);

export function MetaApiUsage({ initial }: { initial: Usage }) {
  const t = useT();
  const [usage, setUsage] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  // Rendered only after mount: formatting a timestamp on the server and again
  // in the browser is exactly what makes React report a hydration mismatch.
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch("/api/admin/metaapi", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; data?: Usage };
      if (json.ok && json.data) setUsage(json.data);
    } catch {
      /* a dropped poll is not worth surfacing; the next one will land */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setUpdatedLabel(new Date(usage.measuredAt).toLocaleTimeString());
  }, [usage.measuredAt]);

  useEffect(() => {
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {updatedLabel ? t.metaapi.updatedAt.replace("{time}", updatedLabel) : " "}
        </p>
        <Button size="sm" variant="secondary" loading={refreshing} onClick={load}>
          <RefreshCw className="h-4 w-4" />
          {t.metaapi.refresh}
        </Button>
      </div>

      {usage.lowBalance && usage.balance && (
        <div
          className="flex flex-wrap items-start justify-between gap-4 rounded-xl px-4 py-3.5"
          style={{
            background: "color-mix(in srgb, var(--candle-down) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--candle-down) 35%, transparent)",
          }}
        >
          <p className="flex items-start gap-2 text-sm" style={{ color: "var(--candle-down)" }}>
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t.metaapi.lowBalanceWarning
                .replace("{balance}", money(usage.balance.amount))
                .replace("{threshold}", money(usage.lowBalanceThreshold))}
              {usage.daysRemaining !== null && (
                <>
                  {" "}
                  {t.metaapi.lowBalanceRunway.replace("{days}", usage.daysRemaining.toFixed(1))}
                </>
              )}
            </span>
          </p>
          <a
            href={TOP_UP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--gold-soft), var(--gold))" }}
          >
            <Wallet className="h-4 w-4" />
            {t.metaapi.topUp}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {usage.balanceError && (
        <p
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--bg)", color: "var(--candle-down)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t.metaapi.balanceError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.metaapi.balance}
          value={usage.balance ? money(usage.balance.amount) : "—"}
          tone={usage.balance && usage.balance.amount < 10 ? "loss" : "gold"}
        />
        <StatCard
          label={t.metaapi.trial}
          value={usage.balance ? money(usage.balance.trialAmount) : "—"}
        />
        <StatCard label={t.metaapi.deployed} value={usage.deployedAccounts} hint={t.metaapi.deployedHint} />
        <StatCard
          label={t.metaapi.burn}
          value={usage.burnPerDay === null ? "—" : money(usage.burnPerDay)}
          hint={
            usage.windowHours === null
              ? t.metaapi.burnPending
              : t.metaapi.burnWindow.replace("{hours}", usage.windowHours.toFixed(1))
          }
        />
      </div>

      <Card>
        <CardHeader title={t.metaapi.runwayTitle} subtitle={t.metaapi.runwaySubtitle} />
        {usage.daysRemaining === null ? (
          <p className="text-sm text-muted">{t.metaapi.runwayPending}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <p className="text-3xl font-semibold tabular-nums">
              {usage.daysRemaining.toFixed(1)}
              <span className="ml-1 text-base font-normal text-muted">{t.metaapi.days}</span>
            </p>
            {usage.projectedDepletion && (
              <p className="text-sm text-muted">
                {t.metaapi.depletesOn.replace(
                  "{date}",
                  new Date(usage.projectedDepletion).toISOString().slice(0, 10),
                )}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={t.metaapi.fundingTitle} subtitle={t.metaapi.fundingSubtitle} />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <a
            href={TOP_UP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--gold-line)] hover:text-gold"
            style={{ borderColor: "var(--panel-border)" }}
          >
            <Wallet className="h-4 w-4" />
            {t.metaapi.topUp}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="text-xs text-muted">{t.metaapi.topUpNote}</p>
        </div>

        {usage.funding.length === 0 ? (
          <p className="text-sm text-muted">{t.metaapi.noFunding}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.metaapi.thWhen}</Th>
                <Th className="text-right">{t.metaapi.thAdded}</Th>
                <Th className="text-right">{t.metaapi.thBalanceAfter}</Th>
              </tr>
            </thead>
            <tbody>
              {usage.funding.map((event) => (
                <tr key={event.at}>
                  <Td className="whitespace-nowrap text-xs">{event.at.slice(0, 16).replace("T", " ")}</Td>
                  <Td className="text-right tabular-nums">
                    <span style={{ color: "var(--candle-up)" }}>+{money(event.amount)}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{money(event.balanceAfter)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title={t.metaapi.breakdownTitle} subtitle={t.metaapi.breakdownSubtitle} />
        {usage.breakdown.length === 0 ? (
          <p className="text-sm text-muted">{t.metaapi.noAccounts}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.metaapi.thState}</Th>
                <Th className="text-right">{t.metaapi.thAccounts}</Th>
              </tr>
            </thead>
            <tbody>
              {usage.breakdown.map((row) => (
                <tr key={row.state}>
                  <Td>{row.state}</Td>
                  <Td className="text-right tabular-nums">{row.count}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
