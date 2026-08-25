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
import Link from "next/link";
import { AlertTriangle, History, Plug, Plus, RefreshCw, Unplug, Users, X } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { BrokerServerPicker } from "./broker-server-picker";
import { ACCOUNT_CURRENCIES } from "@/lib/currencies";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

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
  isEnabled: boolean;
  /** What the provider last reported: DEPLOYED, UNDEPLOYED, DEPLOYING, … */
  providerState: string | null;
  /** Members still following a strategy published from this account. */
  followerCount: number;
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
  const t = useT();
  const [showForm, setShowForm] = useState(accounts.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Controlled because the broker/server lookup is version-specific.
  const [platform, setPlatform] = useState<"MT4" | "MT5">("MT5");
  // Bumped after a successful add so the picker, which holds its own state,
  // is remounted empty — form.reset() cannot clear a controlled input.
  const [formKey, setFormKey] = useState(0);

  async function call(url: string, options: RequestInit = {}) {
    const res = await apiFetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as ApiResponse;
    if (!res.ok || !json.ok) throw json.error ?? { message: t.accountManager.requestFailed };
    return json;
  }

  async function act(id: string, action: "connect" | "disconnect" | "sync") {
    setBusyId(`${id}:${action}`);
    try {
      await call(`/api/accounts/${id}/${action}`, { method: "POST" });
            const done =
        action === "connect"
          ? t.accountManager.connected
          : action === "disconnect"
            ? t.accountManager.disconnected
            : t.accountManager.synced2;
      setToast({ message: done, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? t.accountManager.requestFailed, tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function setEnabled(id: string, enabled: boolean, label: string) {
    // Disabling stops the account at the provider, so it is worth confirming;
    // enabling is harmless and does not interrupt.
    if (!enabled && !window.confirm(t.accountManager.disableConfirm.replace("{label}", label))) return;

    setBusyId(`${id}:enabled`);
    try {
      await call(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      setToast({
        message: enabled ? t.accountManager.enabled : t.accountManager.disabled,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? t.accountManager.requestFailed, tone: "error" });
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
      setToast({ message: t.accountManager.added, tone: "success" });
      setShowForm(false);
      (event.target as HTMLFormElement).reset();
      setPlatform("MT5");
      setFormKey((n) => n + 1);
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; details?: { path: string; message: string }[] };
      if (err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      setToast({ message: err.message ?? t.accountManager.couldNotAdd, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {accounts.length === 0 && !showForm && (
        <EmptyState
          title={t.accountManager.emptyTitle}
          description={t.accountManager.emptyBody}
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              {t.accountManager.addAccount}
            </Button>
          }
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
                <span className="ml-1 flex items-center gap-2">
                  <span className="text-xs text-muted">
                    {account.isEnabled ? t.accountManager.on : t.accountManager.off}
                  </span>
                  <ToggleSwitch
                    checked={account.isEnabled}
                    busy={busyId === `${account.id}:enabled`}
                    disabled={isLockedOn(account)}
                    label={t.accountManager.toggleLabel.replace("{label}", account.label)}
                    onChange={(next) => setEnabled(account.id, next, account.label)}
                  />
                </span>
              </div>
            }
          />

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label={t.accountManager.typeLabel} value={account.accountType} />
            <Field label={t.accountManager.positionMode} value={account.positionMode} />
            <Field label={t.accountManager.balance} value={formatCurrency(account.balance, account.currency)} />
            <Field label={t.accountManager.equity} value={formatCurrency(account.equity, account.currency)} />
          </div>

          {isLockedOn(account) && (
            <p
              className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--bg)", color: "var(--gold)" }}
            >
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              {t.accountManager.followerLock.replace("{count}", String(account.followerCount))}
            </p>
          )}

          {!account.isEnabled && (
            <p
              className="mt-4 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--bg)", color: "var(--gold)" }}
            >
              {t.accountManager.disabledNotice}
            </p>
          )}

          {/* The switch shows what was asked for; this shows when the provider
              has not (yet) agreed, instead of quietly presenting our own flag
              as the truth. */}
          {providerMismatch(account) && (
            <p
              className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--bg)", color: "var(--candle-down)" }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t.accountManager.stateMismatch.replace("{state}", account.providerState ?? "UNKNOWN")}
            </p>
          )}

          {account.lastError && (
            <p className="mt-4 rounded-lg px-3 py-2 text-sm text-red-500" style={{ background: "var(--bg)" }}>
              {account.lastError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {account.connectionStatus === "CONNECTED" ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!account.isEnabled}
                  loading={busyId === `${account.id}:sync`}
                  onClick={() => act(account.id, "sync")}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t.accountManager.syncNow}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!account.isEnabled}
                  loading={busyId === `${account.id}:disconnect`}
                  onClick={() => act(account.id, "disconnect")}
                >
                  <Unplug className="h-4 w-4" />
                  {t.accountManager.disconnect}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={!account.isEnabled}
                loading={busyId === `${account.id}:connect`}
                onClick={() => act(account.id, "connect")}
              >
                <Plug className="h-4 w-4" />
                {t.accountManager.connect}
              </Button>
            )}
            <Link
              href={`/account/${account.id}/history`}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--gold-line)] hover:text-gold"
              style={{ borderColor: "var(--panel-border)" }}
            >
              <History className="h-4 w-4" />
              {t.accountManager.tradeHistory}
            </Link>
            {account.lastSyncAt && (
              <span className="self-center text-xs text-muted">
                {t.accountManager.synced.replace(
                  "{time}",
                  new Date(account.lastSyncAt).toLocaleString(),
                )}
              </span>
            )}
          </div>
        </Card>
      ))}

      {showForm ? (
        <Card>
          <CardHeader title={t.accountManager.formTitle} subtitle={t.accountManager.formSubtitle} />
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="label" label={t.accountManager.name} required placeholder={t.accountManager.namePlaceholder} error={fieldErrors.label} />
              <Select
                name="platform"
                label={t.accountManager.platform}
                options={["MT5", "MT4"]}
                value={platform}
                onChange={(next) => setPlatform(next as "MT4" | "MT5")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <BrokerServerPicker
                key={formKey}
                platform={platform}
                brokerError={fieldErrors.broker}
                serverError={fieldErrors.server}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input name="login" label={t.accountManager.login} required placeholder="12345678" error={fieldErrors.login} />
              <Select name="accountType" label={t.accountManager.accountType} options={["DEMO", "LIVE"]} />
              <Select
                name="currency"
                label={t.accountManager.currency}
                options={ACCOUNT_CURRENCIES}
                error={fieldErrors.currency}
              />
            </div>
            <Input
              name="password"
              type="password"
              label={t.accountManager.tradingPassword}
              required
              autoComplete="off"
              error={fieldErrors.password}
            />
            <p className="text-xs leading-relaxed text-muted">
              {t.accountManager.passwordNote}
            </p>
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                <Plus className="h-4 w-4" />
                {t.accountManager.addAccount}
              </Button>
              {accounts.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  <X className="h-4 w-4" />
                  {t.accountManager.cancel}
                </Button>
              )}
            </div>
          </form>
        </Card>
      ) : (
        accounts.length > 0 && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            {t.accountManager.addAnother}
          </Button>
        )
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}

/**
 * True when the account is publishing to followers and so must stay on.
 *
 * Only the off direction is blocked. Locking the switch in both directions
 * would trap an account that is already off — it could never be brought back
 * for the very followers the rule exists to protect.
 */
function isLockedOn(account: AccountView): boolean {
  return account.isEnabled && account.followerCount > 0;
}

/**
 * True when the provider's reported state contradicts what the member asked
 * for. Transitional states are not a mismatch — they are the provider still
 * working through the request.
 */
function providerMismatch(account: AccountView): boolean {
  const state = account.providerState;
  if (!state || state === "DEPLOYING" || state === "UNDEPLOYING") return false;
  return account.isEnabled ? state !== "DEPLOYED" : state === "DEPLOYED";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Select({
  name,
  label,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  options: readonly string[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : {})}
        className="panel h-10 w-full rounded-lg px-3 text-sm outline-none transition focus:border-brand-500"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
