"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountOption, StrategyView } from "./strategy-browser";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

export function SubscribeDialog({
  strategy,
  accounts,
  onClose,
  onDone,
}: {
  strategy: StrategyView;
  accounts: AccountOption[];
  onClose: () => void;
  onDone: (message: string, tone: "success" | "error") => void;
}) {
  const t = useT();
  const connected = accounts.filter((account) => account.connectionStatus === "CONNECTED");

  const lotModes = [
    { value: "MULTIPLIER", label: t.subscribe.modeMultiplier, hint: t.subscribe.modeMultiplierHint },
    { value: "FIXED", label: t.subscribe.modeFixed, hint: t.subscribe.modeFixedHint },
    { value: "BALANCE_RATIO", label: t.subscribe.modeBalance, hint: t.subscribe.modeBalanceHint },
    { value: "RISK_PERCENT", label: t.subscribe.modeRisk, hint: t.subscribe.modeRiskHint },
  ];
  const [lotMode, setLotMode] = useState<string>("MULTIPLIER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const res = await apiFetch("/api/copy/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: strategy.id,
          accountId: String(form.get("accountId") ?? ""),
          copySettings: {
            lotMode,
            fixedLot: Number(form.get("fixedLot") ?? 0.01),
            multiplier: Number(form.get("multiplier") ?? 1),
            balanceRatio: Number(form.get("balanceRatio") ?? 1),
            riskPercent: Number(form.get("riskPercent") ?? 1),
            minLot: Number(form.get("minLot") ?? 0.01),
            maxLot: Number(form.get("maxLot") ?? 10),
            allowMinLotRounding: form.get("allowMinLotRounding") === "on",
            maxOpenTrades: Number(form.get("maxOpenTrades") ?? 20),
            copyBuy: form.get("copyBuy") === "on",
            copySell: form.get("copySell") === "on",
            copySl: form.get("copySl") === "on",
            copyTp: form.get("copyTp") === "on",
            allowedSymbols: String(form.get("allowedSymbols") ?? "")
              .split(",")
              .map((symbol) => symbol.trim().toUpperCase())
              .filter(Boolean),
          },
          riskProfile: {
            maxDailyLoss: Number(form.get("maxDailyLoss") ?? 0),
            maxDrawdownPct: Number(form.get("maxDrawdownPct") ?? 0),
            stopCopyOnBreach: true,
          },
        }),
      });

      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? t.subscribe.couldNotSubscribe);
      onDone(t.subscribe.done.replace("{name}", strategy.name), "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.subscribe.couldNotSubscribe);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="panel my-8 w-full max-w-2xl rounded-2xl p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t.subscribe.title.replace("{name}", strategy.name)}</h2>
            <p className="mt-1 text-sm text-muted">
              {t.subscribe.subtitle}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.subscribe.close} className="text-muted transition hover:opacity-70">
            ×
          </button>
        </div>

        {connected.length === 0 ? (
          <div className="rounded-lg p-4 text-sm" style={{ background: "var(--bg)" }}>
            <p className="font-medium">{t.subscribe.noAccountTitle}</p>
            <p className="mt-1 text-muted">
              {t.subscribe.noAccountBody}
            </p>
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
                {t.subscribe.close}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="accountId" className="block text-sm font-medium">
                {t.subscribe.tradingAccount}
              </label>
              <select
                id="accountId"
                name="accountId"
                required
                className="panel h-10 w-full rounded-lg px-3 text-sm outline-none focus:border-brand-500"
              >
                {connected.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} ({account.platform})
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t.subscribe.lotSizing}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {lotModes.map((mode) => (
                  <label
                    key={mode.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm"
                    style={{
                      background: "var(--bg)",
                      border: `1px solid ${lotMode === mode.value ? "var(--gold-line)" : "transparent"}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="lotMode"
                      value={mode.value}
                      checked={lotMode === mode.value}
                      onChange={() => setLotMode(mode.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium">{mode.label}</span>
                      <span className="block text-xs text-muted">{mode.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              {lotMode === "FIXED" && <Input name="fixedLot" type="number" step="0.01" min="0.01" defaultValue="0.01" label={t.subscribe.fixedLot} />}
              {lotMode === "MULTIPLIER" && (
                <Input name="multiplier" type="number" step="0.1" min="0.01" defaultValue="1" label={t.subscribe.multiplier} />
              )}
              {lotMode === "BALANCE_RATIO" && (
                <Input name="balanceRatio" type="number" step="0.1" min="0.01" defaultValue="1" label={t.subscribe.balanceRatio} />
              )}
              {lotMode === "RISK_PERCENT" && (
                <Input name="riskPercent" type="number" step="0.1" min="0.01" max="20" defaultValue="1" label={t.subscribe.riskPercent} />
              )}
              <Input name="maxOpenTrades" type="number" min="1" max="200" defaultValue="20" label={t.subscribe.maxOpenTrades} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="minLot" type="number" step="0.01" min="0.01" defaultValue="0.01" label={t.subscribe.minimumLot} />
              <Input name="maxLot" type="number" step="0.01" min="0.01" defaultValue="10" label={t.subscribe.maximumLot} />
            </div>

            <label className="flex items-start gap-3 rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
              <input type="checkbox" name="allowMinLotRounding" className="mt-1" />
              <span>
                <span className="block font-medium">{t.subscribe.roundUpTitle}</span>
                <span className="block text-xs text-muted">
                  {t.subscribe.roundUpHint}
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="maxDailyLoss" type="number" min="0" defaultValue="0" label={t.subscribe.maxDailyLoss} />
              <Input name="maxDrawdownPct" type="number" min="0" max="100" defaultValue="0" label={t.subscribe.maxDrawdown} />
            </div>

            <Input
              name="allowedSymbols"
              label={t.subscribe.allowedSymbols}
              placeholder={t.subscribe.allowedSymbolsPlaceholder}
            />

            <fieldset className="flex flex-wrap gap-4 text-sm">
              <Checkbox name="copyBuy" label={t.subscribe.copyBuys} defaultChecked />
              <Checkbox name="copySell" label={t.subscribe.copySells} defaultChecked />
              <Checkbox name="copySl" label={t.subscribe.copyStopLoss} defaultChecked />
              <Checkbox name="copyTp" label={t.subscribe.copyTakeProfit} defaultChecked />
            </fieldset>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                <Check className="h-4 w-4" />
                {t.subscribe.submit}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
                {t.subscribe.cancel}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
