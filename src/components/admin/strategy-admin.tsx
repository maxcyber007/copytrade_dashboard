"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pause, Play, Plus, Square, Trash2, X } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/locale-provider";
import { formatPercent } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client/browser";

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

export function StrategyAdmin({ strategies }: { strategies: AdminStrategyView[] }) {
  const router = useRouter();
  const t = useT();
  const [showForm, setShowForm] = useState(false);

  const statusActions: Record<
    string,
    {
      label: string;
      status: string;
      variant: "primary" | "secondary" | "danger";
      Icon: typeof Play;
    }[]
  > = {
    DRAFT: [{ label: t.strategyAdmin.activate, status: "ACTIVE", variant: "primary", Icon: Play }],
    ACTIVE: [
      { label: t.strategyAdmin.pause, status: "PAUSED", variant: "secondary", Icon: Pause },
      { label: t.strategyAdmin.stop, status: "STOPPED", variant: "danger", Icon: Square },
    ],
    PAUSED: [
      { label: t.strategyAdmin.resume, status: "ACTIVE", variant: "primary", Icon: Play },
      { label: t.strategyAdmin.stop, status: "STOPPED", variant: "danger", Icon: Square },
    ],
    STOPPED: [{ label: t.strategyAdmin.activate, status: "ACTIVE", variant: "primary", Icon: Play }],
    ARCHIVED: [],
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function call(url: string, options: RequestInit) {
    const res = await apiFetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      error?: { message: string; details?: { path: string; message: string }[] };
    };
    if (!res.ok || !json.ok) throw json.error ?? { message: t.strategyAdmin.requestFailed };
    return json;
  }

  async function setStatus(id: string, status: string) {
    // Pausing or stopping can also close what members already have open.
    let closeExistingPositions = false;
    if (status !== "ACTIVE") {
      closeExistingPositions = window.confirm(
        t.strategyAdmin.closePositionsPrompt,
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
      setToast({ message: (error as { message?: string }).message ?? t.strategyAdmin.requestFailed, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(t.strategyAdmin.deleteConfirm.replace("{name}", name))) return;
    setBusy(`${id}:delete`);
    try {
      await call(`/api/admin/strategies/${id}`, { method: "DELETE" });
      setToast({ message: t.strategyAdmin.deleted, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? t.strategyAdmin.requestFailed, tone: "error" });
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
      setToast({ message: t.strategyAdmin.createdDraft, tone: "success" });
      setShowForm(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; details?: { path: string; message: string }[] };
      if (err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      setToast({ message: err.message ?? t.strategyAdmin.couldNotCreate, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {!showForm && <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          {t.strategyAdmin.newPlatformStrategy}
        </Button>}

      {showForm && (
        <Card>
          <CardHeader title={t.strategyAdmin.newStrategy} subtitle={t.strategyAdmin.newStrategySubtitle} />
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="code" label={t.strategyAdmin.code} required placeholder="STRATEGY-001" error={fieldErrors.code} />
              <Input name="name" label={t.strategyAdmin.name} required placeholder="Gold Scalper Pro" error={fieldErrors.name} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="description" className="block text-sm font-medium">
                {t.strategyAdmin.description}
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="panel w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField name="masterPlatform" label={t.strategyAdmin.masterPlatform} options={["MT5", "MT4"]} />
              <Input name="masterAccountCode" label={t.strategyAdmin.masterAccountCode} placeholder="MASTER-001" />
              <SelectField name="minPlanTier" label={t.strategyAdmin.minimumPlan} options={["FREE", "BASIC", "PRO", "PREMIUM"]} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublic" defaultChecked />
              {t.strategyAdmin.listedPublicly}
            </label>
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                <Plus className="h-4 w-4" />
                {t.strategyAdmin.createStrategy}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
                {t.strategyAdmin.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {strategies.length === 0 ? (
        <EmptyState title={t.strategyAdmin.emptyTitle} description={t.strategyAdmin.emptyBody} />
      ) : (
        strategies.map((strategy) => (
          <Card key={strategy.id}>
            <CardHeader
              title={strategy.name}
              subtitle={`${strategy.code} · ${
                strategy.ownerType === "PROVIDER"
                  ? `${t.strategyAdmin.providerPrefix} ${strategy.providerName}`
                  : t.strategyAdmin.platformOwned
              } · ${t.strategyAdmin.masterOn} ${strategy.masterPlatform}`}
              action={<StatusBadge status={strategy.status} />}
            />
            {strategy.description && <p className="mb-4 text-sm text-muted">{strategy.description}</p>}

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Metric label={t.strategyAdmin.subscribers} value={String(strategy.subscribers)} />
              <Metric label={t.strategyAdmin.eventsReceived} value={String(strategy.events)} />
              <Metric label={t.strategyAdmin.returnLabel} value={formatPercent(strategy.totalReturnPct)} />
              <Metric
                label={t.strategyAdmin.visibility}
                value={strategy.isPublic ? t.strategyAdmin.public : t.strategyAdmin.hidden}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(statusActions[strategy.status] ?? []).map((action) => (
                <Button
                  key={action.status}
                  size="sm"
                  variant={action.variant}
                  loading={busy === `${strategy.id}:${action.status}`}
                  onClick={() => setStatus(strategy.id, action.status)}
                >
                  <action.Icon className="h-4 w-4" />
                  {action.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="danger"
                loading={busy === `${strategy.id}:delete`}
                onClick={() => remove(strategy.id, strategy.name)}
              >
                <Trash2 className="h-4 w-4" />
                {t.strategyAdmin.delete}
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
