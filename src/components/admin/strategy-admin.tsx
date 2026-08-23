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

export type AdminStrategyView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  ownerType: string;
  providerName: string | null;
  masterPlatform: string;
  masterAccountCode: string | null;
  minPlanTier: string;
  isPublic: boolean;
  subscribers: number;
  events: number;
  totalReturnPct: number;
};

const STATUS_ACTIONS: Record<string, { label: string; status: string; variant: "primary" | "secondary" | "danger" }[]> = {
  DRAFT: [{ label: "Activate", status: "ACTIVE", variant: "primary" }],
  ACTIVE: [
    { label: "Pause", status: "PAUSED", variant: "secondary" },
    { label: "Stop", status: "STOPPED", variant: "danger" },
  ],
  PAUSED: [
    { label: "Resume", status: "ACTIVE", variant: "primary" },
    { label: "Stop", status: "STOPPED", variant: "danger" },
  ],
  STOPPED: [{ label: "Activate", status: "ACTIVE", variant: "primary" }],
  ARCHIVED: [],
};

export function StrategyAdmin({ strategies }: { strategies: AdminStrategyView[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function call(url: string, options: RequestInit) {
    const res = await fetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      error?: { message: string; details?: { path: string; message: string }[] };
    };
    if (!res.ok || !json.ok) throw json.error ?? { message: "Request failed" };
    return json;
  }

  async function setStatus(id: string, status: string) {
    // Pausing or stopping can also close what members already have open.
    let closeExistingPositions = false;
    if (status !== "ACTIVE") {
      closeExistingPositions = window.confirm(
        "Close existing member positions as well?\n\nOK = close them, Cancel = keep them open.",
      );
    }

    setBusy(`${id}:${status}`);
    try {
      await call(`/api/admin/strategies/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, closeExistingPositions }),
      });
      setToast({ message: `Strategy set to ${status}`, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setBusy(`${id}:delete`);
    try {
      await call(`/api/admin/strategies/${id}`, { method: "DELETE" });
      setToast({ message: "Strategy deleted", tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);

    try {
      await call("/api/admin/strategies", {
        method: "POST",
        body: JSON.stringify({
          code: String(form.get("code") ?? "").toUpperCase(),
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          masterPlatform: String(form.get("masterPlatform") ?? "MT5"),
          masterAccountCode: String(form.get("masterAccountCode") ?? ""),
          minPlanTier: String(form.get("minPlanTier") ?? "FREE"),
          isPublic: form.get("isPublic") === "on",
        }),
      });
      setToast({ message: "Strategy created as a draft", tone: "success" });
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

  return (
    <div className="space-y-5">
      {!showForm && <Button onClick={() => setShowForm(true)}>New platform strategy</Button>}

      {showForm && (
        <Card>
          <CardHeader title="New strategy" subtitle="Created as a draft; activate it when the master EA is ready." />
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="code" label="Code" required placeholder="STRATEGY-001" error={fieldErrors.code} />
              <Input name="name" label="Name" required placeholder="Gold Scalper Pro" error={fieldErrors.name} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="description" className="block text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="panel w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField name="masterPlatform" label="Master platform" options={["MT5", "MT4"]} />
              <Input name="masterAccountCode" label="Master account code" placeholder="MASTER-001" />
              <SelectField name="minPlanTier" label="Minimum plan" options={["FREE", "BASIC", "PRO", "PREMIUM"]} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublic" defaultChecked />
              Listed publicly for members to subscribe
            </label>
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                Create strategy
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {strategies.length === 0 ? (
        <EmptyState title="No strategies yet" description="Create one, or approve a provider's draft." />
      ) : (
        strategies.map((strategy) => (
          <Card key={strategy.id}>
            <CardHeader
              title={strategy.name}
              subtitle={`${strategy.code} · ${
                strategy.ownerType === "PROVIDER" ? `provider: ${strategy.providerName}` : "platform owned"
              } · master on ${strategy.masterPlatform}`}
              action={<StatusBadge status={strategy.status} />}
            />
            {strategy.description && <p className="mb-4 text-sm text-muted">{strategy.description}</p>}

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Metric label="Subscribers" value={String(strategy.subscribers)} />
              <Metric label="Events received" value={String(strategy.events)} />
              <Metric label="Return" value={formatPercent(strategy.totalReturnPct)} />
              <Metric label="Visibility" value={strategy.isPublic ? "Public" : "Hidden"} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(STATUS_ACTIONS[strategy.status] ?? []).map((action) => (
                <Button
                  key={action.status}
                  size="sm"
                  variant={action.variant}
                  loading={busy === `${strategy.id}:${action.status}`}
                  onClick={() => setStatus(strategy.id, action.status)}
                >
                  {action.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="danger"
                loading={busy === `${strategy.id}:delete`}
                onClick={() => remove(strategy.id, strategy.name)}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
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

function SelectField({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        className="panel h-10 w-full rounded-lg px-3 text-sm outline-none focus:border-brand-500"
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
