"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountOption, StrategyView } from "./strategy-browser";

const LOT_MODES = [
  { value: "MULTIPLIER", label: "Multiplier", hint: "Master lot × your multiplier" },
  { value: "FIXED", label: "Fixed lot", hint: "Always the same lot size" },
  { value: "BALANCE_RATIO", label: "Balance ratio", hint: "Scaled by your balance vs the master's" },
  { value: "RISK_PERCENT", label: "Risk percent", hint: "Sized so the stop risks a set % of equity" },
] as const;

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
  const connected = accounts.filter((account) => account.connectionStatus === "CONNECTED");
  const [lotMode, setLotMode] = useState<string>("MULTIPLIER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/copy/subscribe", {
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
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Could not subscribe");
      onDone(`Subscribed to ${strategy.name}. Start copying when you are ready.`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not subscribe");
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
            <h2 className="text-lg font-semibold">Subscribe to {strategy.name}</h2>
            <p className="mt-1 text-sm text-muted">
              These settings are yours. The provider decides what to trade; you decide how much of it
              reaches your account.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted transition hover:opacity-70">
            ×
          </button>
        </div>

        {connected.length === 0 ? (
          <div className="rounded-lg p-4 text-sm" style={{ background: "var(--bg)" }}>
            <p className="font-medium">No connected account</p>
            <p className="mt-1 text-muted">
              Connect a trading account first — copying into an account we cannot reach would fail on
              the first trade.
            </p>
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="accountId" className="block text-sm font-medium">
                Trading account
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
              <legend className="mb-2 text-sm font-medium">Lot sizing</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {LOT_MODES.map((mode) => (
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
              {lotMode === "FIXED" && <Input name="fixedLot" type="number" step="0.01" min="0.01" defaultValue="0.01" label="Fixed lot" />}
              {lotMode === "MULTIPLIER" && (
                <Input name="multiplier" type="number" step="0.1" min="0.01" defaultValue="1" label="Multiplier" />
              )}
              {lotMode === "BALANCE_RATIO" && (
                <Input name="balanceRatio" type="number" step="0.1" min="0.01" defaultValue="1" label="Balance ratio" />
              )}
              {lotMode === "RISK_PERCENT" && (
                <Input name="riskPercent" type="number" step="0.1" min="0.01" max="20" defaultValue="1" label="Risk % per trade" />
              )}
              <Input name="maxOpenTrades" type="number" min="1" max="200" defaultValue="20" label="Max open trades" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="minLot" type="number" step="0.01" min="0.01" defaultValue="0.01" label="Minimum lot" />
              <Input name="maxLot" type="number" step="0.01" min="0.01" defaultValue="10" label="Maximum lot" />
            </div>

            <label className="flex items-start gap-3 rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
              <input type="checkbox" name="allowMinLotRounding" className="mt-1" />
              <span>
                <span className="block font-medium">Round up to the broker minimum</span>
                <span className="block text-xs text-muted">
                  When your settings size a trade below the smallest lot your broker accepts, take it
                  at that minimum instead of skipping it. This means more exposure than you
                  configured, so it is off by default.
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="maxDailyLoss" type="number" min="0" defaultValue="0" label="Max daily loss (0 = off)" />
              <Input name="maxDrawdownPct" type="number" min="0" max="100" defaultValue="0" label="Max drawdown % (0 = off)" />
            </div>

            <Input
              name="allowedSymbols"
              label="Allowed symbols (optional)"
              placeholder="XAUUSD, EURUSD — leave empty to allow all"
            />

            <fieldset className="flex flex-wrap gap-4 text-sm">
              <Checkbox name="copyBuy" label="Copy buys" defaultChecked />
              <Checkbox name="copySell" label="Copy sells" defaultChecked />
              <Checkbox name="copySl" label="Copy stop loss" defaultChecked />
              <Checkbox name="copyTp" label="Copy take profit" defaultChecked />
            </fieldset>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                Subscribe
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
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
