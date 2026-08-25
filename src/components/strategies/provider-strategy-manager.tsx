"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, X } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/locale-provider";
import { formatPercent } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client/browser";

export type ProviderStrategyView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  masterPlatform: string;
  subscribers: number;
  events: number;
  totalReturnPct: number;
  /** The account the platform publishes from, when there is one. */
  masterAccountId: string | null;
  watchStartedAt: string | null;
  watchLastPollAt: string | null;
};

/** One of the provider's own trading accounts, offered as a publishing source. */
export type MasterAccountOption = {
  id: string;
  label: string;
  platform: string;
  login: string;
  connectionStatus: string;
};

export function ProviderStrategyManager({
  strategies,
  accounts,
}: {
  strategies: ProviderStrategyView[];
  accounts: MasterAccountOption[];
}) {
  const router = useRouter();
  const t = useT();
  const [showForm, setShowForm] = useState(strategies.length === 0);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Shown once, right after issuing — the secret cannot be retrieved later. */

  async function call(url: string, options: RequestInit) {
    const res = await apiFetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      data?: { key?: { keyId: string; secret: string } };
      error?: { message: string; details?: { path: string; message: string }[] };
    };
    if (!res.ok || !json.ok) throw json.error ?? { message: t.providerStrategies.requestFailed };
    return json;
  }

  async function createStrategy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);

    try {
      await call("/api/provider/strategies", {
        method: "POST",
        body: JSON.stringify({
          code: String(form.get("code") ?? "").toUpperCase(),
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          masterPlatform: String(form.get("masterPlatform") ?? "MT5"),
          masterAccountCode: String(form.get("masterAccountCode") ?? ""),
          isPublic: true,
        }),
      });
      setToast({ message: t.providerStrategies.createdDraft, tone: "success" });
      setShowForm(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; details?: { path: string; message: string }[] };
      if (err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      setToast({ message: err.message ?? t.providerStrategies.couldNotCreate, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function setMasterAccount(strategyId: string, accountId: string | null) {
    setBusy(`${strategyId}:master`);
    try {
      await call(`/api/provider/strategies/${strategyId}/master-account`, {
        method: "PUT",
        body: JSON.stringify({ accountId }),
      });
      setToast({
        message: accountId
          ? t.providerStrategies.publishingStarted
          : t.providerStrategies.publishingStopped,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? t.providerStrategies.requestFailed, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {!showForm && <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          {t.providerStrategies.newStrategy}
        </Button>}

      {showForm && (
        <Card>
          <CardHeader title={t.providerStrategies.newStrategy} subtitle={t.providerStrategies.newStrategySubtitle} />
          <form onSubmit={createStrategy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="code" label={t.providerStrategies.code} required placeholder="GOLD-DESK-01" error={fieldErrors.code} />
              <Input name="name" label={t.providerStrategies.name} required placeholder="Gold Desk Intraday" error={fieldErrors.name} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="description" className="block text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder={t.providerStrategies.descriptionPlaceholder}
                className="panel w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="masterPlatform" className="block text-sm font-medium">
                  {t.providerStrategies.masterPlatform}
                </label>
                <select
                  id="masterPlatform"
                  name="masterPlatform"
                  className="panel h-10 w-full rounded-lg px-3 text-sm outline-none focus:border-brand-500"
                >
                  <option value="MT5">MT5</option>
                  <option value="MT4">MT4</option>
                </select>
              </div>
              <Input name="masterAccountCode" label={t.providerStrategies.masterAccountCode} placeholder="MASTER-001" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                <Plus className="h-4 w-4" />
                {t.providerStrategies.createStrategy}
              </Button>
              {strategies.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  <X className="h-4 w-4" />
                  {t.providerStrategies.cancel}
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      {strategies.length === 0 && !showForm ? (
        <EmptyState title={t.providerStrategies.emptyTitle} description={t.providerStrategies.emptyBody} />
      ) : (
        strategies.map((strategy) => (
          <Card key={strategy.id}>
            <CardHeader
              title={strategy.name}
              subtitle={`${strategy.code} · ${t.providerStrategies.masterOn} ${strategy.masterPlatform}`}
              action={<StatusBadge status={strategy.status} />}
            />
            {strategy.description && <p className="mb-4 text-sm text-muted">{strategy.description}</p>}

            <div className="grid grid-cols-3 gap-3 text-sm">
              <Metric label={t.providerStrategies.subscribers} value={String(strategy.subscribers)} />
              <Metric label={t.providerStrategies.eventsReceived} value={String(strategy.events)} />
              <Metric label={t.providerStrategies.returnLabel} value={formatPercent(strategy.totalReturnPct)} />
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-muted">{t.providerStrategies.publishingSource}</p>
              <MasterAccountPicker
                strategy={strategy}
                accounts={accounts}
                busy={busy === `${strategy.id}:master`}
                onChange={(accountId) => setMasterAccount(strategy.id, accountId)}
              />
            </div>
          </Card>
        ))
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}

/**
 * Chooses which trading account a strategy publishes from.
 *
 * Only the owner's accounts on the strategy's own platform are offered: an MT4
 * account cannot publish an MT5 strategy's trades, and finding that out from a
 * rejected request is worse than not being offered the choice.
 */
function MasterAccountPicker({
  strategy,
  accounts,
  busy,
  onChange,
}: {
  strategy: ProviderStrategyView;
  accounts: MasterAccountOption[];
  busy: boolean;
  onChange: (accountId: string | null) => void;
}) {
  const t = useT();
  const usable = accounts.filter((account) => account.platform === strategy.masterPlatform);
  const linked = usable.find((account) => account.id === strategy.masterAccountId);

  if (usable.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted">
        {t.providerStrategies.noUsableAccount.replace("{platform}", strategy.masterPlatform)}
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t.providerStrategies.publishFrom}
          disabled={busy}
          value={strategy.masterAccountId ?? ""}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
          className="panel h-10 rounded-lg px-3 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{t.providerStrategies.viaMasterEa}</option>
          {usable.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label} · {account.login}
              {account.connectionStatus === "CONNECTED" ? "" : ` (${account.connectionStatus.toLowerCase()})`}
            </option>
          ))}
        </select>
      </div>

      {linked && (
        <p className="text-xs text-muted">
          {linked.connectionStatus === "CONNECTED"
            ? strategy.watchStartedAt
              ? t.providerStrategies.watchingSince.replace(
                  "{time}",
                  new Date(strategy.watchStartedAt).toLocaleString(),
                ) +
                (strategy.watchLastPollAt
                  ? t.providerStrategies.lastChecked.replace(
                      "{time}",
                      new Date(strategy.watchLastPollAt).toLocaleTimeString(),
                    )
                  : "")
              : t.providerStrategies.watchingStarts
            : t.providerStrategies.notConnected}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
