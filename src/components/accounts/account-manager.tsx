"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";

export type AccountView = {
  id: string;
  label: string;
  platform: "MT4" | "MT5";
  broker: string;
  login: string;
  server: string;
  accountType: string;
  currency: string;
  positionMode: string;
  connectionStatus: string;
  copyStatus: string;
  lastError: string | null;
  balance: number;
  equity: number;
  openTrades: number;
  lastSyncAt: string | null;
};

type ApiResponse = {
  ok: boolean;
  error?: { message: string; details?: { path: string; message: string }[] };
};

export function AccountManager({ accounts }: { accounts: AccountView[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(accounts.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function call(url: string, options: RequestInit = {}) {
    const res = await fetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as ApiResponse;
    if (!res.ok || !json.ok) throw json.error ?? { message: "Request failed" };
    return json;
  }

  async function act(id: string, action: "connect" | "disconnect" | "sync") {
    setBusyId(`${id}:${action}`);
    try {
      await call(`/api/accounts/${id}/${action}`, { method: "POST" });
      setToast({ message: `Account ${action}ed`, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? "Request failed", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Remove "${label}"? Stored credentials are deleted with it.`)) return;
    setBusyId(`${id}:delete`);
    try {
      await call(`/api/accounts/${id}`, { method: "DELETE" });
      setToast({ message: "Account removed", tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? "Request failed", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);

    try {
      await call("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          label: String(form.get("label") ?? ""),
          platform: String(form.get("platform") ?? "MT5"),
          broker: String(form.get("broker") ?? ""),
          login: String(form.get("login") ?? ""),
          server: String(form.get("server") ?? ""),
          accountType: String(form.get("accountType") ?? "DEMO"),
          currency: String(form.get("currency") ?? "USD"),
          password: String(form.get("password") ?? ""),
        }),
      });
      setToast({ message: "Account added. Connect it to load balance and positions.", tone: "success" });
      setShowForm(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; details?: { path: string; message: string }[] };
      if (err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      setToast({ message: err.message ?? "Could not add the account", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {accounts.length === 0 && !showForm && (
        <EmptyState
          title="No trading accounts yet"
          description="Add an MT4 or MT5 account to start copying."
          action={<Button onClick={() => setShowForm(true)}>Add account</Button>}
        />
      )}

      {accounts.map((account) => (
        <Card key={account.id}>
          <CardHeader
            title={account.label}
            subtitle={`${account.platform} · ${account.broker} · ${account.login} @ ${account.server}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={account.connectionStatus} />
                <StatusBadge status={account.copyStatus} />
              </div>
            }
          />

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Type" value={account.accountType} />
            <Field label="Position mode" value={account.positionMode} />
            <Field label="Balance" value={formatCurrency(account.balance, account.currency)} />
            <Field label="Equity" value={formatCurrency(account.equity, account.currency)} />
          </div>

          {account.lastError && (
            <p className="mt-4 rounded-lg px-3 py-2 text-sm text-red-500" style={{ background: "var(--bg)" }}>
              {account.lastError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {account.connectionStatus === "CONNECTED" ? (
              <>
                <Button size="sm" variant="secondary" loading={busyId === `${account.id}:sync`} onClick={() => act(account.id, "sync")}>
                  Sync now
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyId === `${account.id}:disconnect`}
                  onClick={() => act(account.id, "disconnect")}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" loading={busyId === `${account.id}:connect`} onClick={() => act(account.id, "connect")}>
                Connect
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              loading={busyId === `${account.id}:delete`}
              onClick={() => remove(account.id, account.label)}
            >
              Remove
            </Button>
            {account.lastSyncAt && (
              <span className="self-center text-xs text-muted">
                Synced {new Date(account.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>
        </Card>
      ))}

      {showForm ? (
        <Card>
          <CardHeader title="Add a trading account" subtitle="The password is encrypted before it is stored." />
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="label" label="Name" required placeholder="Main live account" error={fieldErrors.label} />
              <Select name="platform" label="Platform" options={["MT5", "MT4"]} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="broker" label="Broker" required placeholder="IC Markets" error={fieldErrors.broker} />
              <Input name="server" label="Server" required placeholder="ICMarkets-Live02" error={fieldErrors.server} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input name="login" label="Login" required placeholder="12345678" error={fieldErrors.login} />
              <Select name="accountType" label="Account type" options={["DEMO", "LIVE"]} />
              <Input name="currency" label="Currency" defaultValue="USD" maxLength={3} error={fieldErrors.currency} />
            </div>
            <Input
              name="password"
              type="password"
              label="Trading password"
              required
              autoComplete="off"
              error={fieldErrors.password}
            />
            <p className="text-xs leading-relaxed text-muted">
              Stored encrypted with AES-256-GCM. It is never returned by the API, never written to a
              log, and never shown again — to change it, remove the account and add it back.
            </p>
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                Add account
              </Button>
              {accounts.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>
      ) : (
        accounts.length > 0 && <Button onClick={() => setShowForm(true)}>Add another account</Button>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        className="panel h-10 w-full rounded-lg px-3 text-sm outline-none transition focus:border-brand-500"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
