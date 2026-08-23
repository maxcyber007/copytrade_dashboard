"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import { formatPercent } from "@/lib/utils";

type ApiKeyView = { id: string; keyId: string; label: string; lastUsedAt: string | null; createdAt: string };

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
  keys: ApiKeyView[];
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
  const [showForm, setShowForm] = useState(strategies.length === 0);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Shown once, right after issuing — the secret cannot be retrieved later. */
  const [issuedSecret, setIssuedSecret] = useState<{ keyId: string; secret: string } | null>(null);

  async function call(url: string, options: RequestInit) {
    const res = await fetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      data?: { key?: { keyId: string; secret: string } };
      error?: { message: string; details?: { path: string; message: string }[] };
    };
    if (!res.ok || !json.ok) throw json.error ?? { message: "Request failed" };
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
      setToast({ message: "Strategy created as a draft — an admin reviews it before it goes live", tone: "success" });
      setShowForm(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; details?: { path: string; message: string }[] };
      if (err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      setToast({ message: err.message ?? "Could not create the strategy", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function issueKey(strategyId: string) {
    setBusy(`${strategyId}:key`);
    try {
      const json = await call(`/api/provider/strategies/${strategyId}/keys`, {
        method: "POST",
        body: JSON.stringify({ label: "Master EA" }),
      });
      if (json.data?.key) setIssuedSecret({ keyId: json.data.key.keyId, secret: json.data.key.secret });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? "Request failed", tone: "error" });
    } finally {
      setBusy(null);
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
          ? "Publishing from this account. Trades opened from now on are copied; anything already open is not."
          : "Stopped publishing from that account",
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(keyId: string) {
    if (!window.confirm("Revoke this key? The master EA using it will stop being accepted immediately.")) return;
    setBusy(`${keyId}:revoke`);
    try {
      await call(`/api/provider/keys/${keyId}`, { method: "DELETE" });
      setToast({ message: "Key revoked", tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {issuedSecret && (
        <Card className="border-gold">
          <CardHeader
            title="Copy this secret now"
            subtitle="It is shown once and cannot be retrieved again. Losing it means issuing a new key."
          />
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">API key</dt>
              <dd className="mt-1 break-all font-mono text-xs">{issuedSecret.keyId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Secret</dt>
              <dd className="mt-1 break-all font-mono text-xs">{issuedSecret.secret}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <Button size="sm" variant="secondary" onClick={() => setIssuedSecret(null)}>
              I have saved it
            </Button>
          </div>
        </Card>
      )}

      {!showForm && <Button onClick={() => setShowForm(true)}>New strategy</Button>}

      {showForm && (
        <Card>
          <CardHeader title="New strategy" subtitle="Created as a draft. An administrator activates it once reviewed." />
          <form onSubmit={createStrategy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="code" label="Code" required placeholder="GOLD-DESK-01" error={fieldErrors.code} />
              <Input name="name" label="Name" required placeholder="Gold Desk Intraday" error={fieldErrors.name} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="description" className="block text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="What members are subscribing to: sessions, instruments, risk approach."
                className="panel w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="masterPlatform" className="block text-sm font-medium">
                  Master platform
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
              <Input name="masterAccountCode" label="Master account code" placeholder="MASTER-001" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                Create strategy
              </Button>
              {strategies.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      {strategies.length === 0 && !showForm ? (
        <EmptyState title="No strategies yet" description="Create one to start publishing signals." />
      ) : (
        strategies.map((strategy) => (
          <Card key={strategy.id}>
            <CardHeader
              title={strategy.name}
              subtitle={`${strategy.code} · master on ${strategy.masterPlatform}`}
              action={<StatusBadge status={strategy.status} />}
            />
            {strategy.description && <p className="mb-4 text-sm text-muted">{strategy.description}</p>}

            <div className="grid grid-cols-3 gap-3 text-sm">
              <Metric label="Subscribers" value={String(strategy.subscribers)} />
              <Metric label="Events received" value={String(strategy.events)} />
              <Metric label="Return" value={formatPercent(strategy.totalReturnPct)} />
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-muted">Publishing source</p>
              <MasterAccountPicker
                strategy={strategy}
                accounts={accounts}
                busy={busy === `${strategy.id}:master`}
                onChange={(accountId) => setMasterAccount(strategy.id, accountId)}
              />
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-muted">Master EA keys</p>
              {strategy.keys.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No active key. Issue one and configure your master EA with it.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {strategy.keys.map((key) => (
                    <li
                      key={key.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-sm"
                      style={{ background: "var(--bg)" }}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs break-all">{key.keyId}</p>
                        <p className="text-xs text-muted">
                          {key.label} · issued {new Date(key.createdAt).toLocaleDateString()} ·{" "}
                          {key.lastUsedAt ? `last used ${new Date(key.lastUsedAt).toLocaleString()}` : "never used"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy === `${key.id}:revoke`}
                        onClick={() => revokeKey(key.id)}
                      >
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Button size="sm" variant="secondary" loading={busy === `${strategy.id}:key`} onClick={() => issueKey(strategy.id)}>
                  Issue new key
                </Button>
              </div>
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
  const usable = accounts.filter((account) => account.platform === strategy.masterPlatform);
  const linked = usable.find((account) => account.id === strategy.masterAccountId);

  if (usable.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted">
        No connected {strategy.masterPlatform} account to publish from. Connect one under Trading Accounts,
        or publish with a master EA using a key below.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Publish from"
          disabled={busy}
          value={strategy.masterAccountId ?? ""}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
          className="panel h-10 rounded-lg px-3 text-sm outline-none focus:border-brand-500"
        >
          <option value="">A master EA (using a key below)</option>
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
              ? `Watching since ${new Date(strategy.watchStartedAt).toLocaleString()}` +
                (strategy.watchLastPollAt
                  ? ` · last checked ${new Date(strategy.watchLastPollAt).toLocaleTimeString()}`
                  : "")
              : "Watching starts on the next check. Positions already open then are recorded but not copied."
            : "This account is not connected, so nothing is being published from it."}
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
