"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type ApiResponse = {
  ok: boolean;
  error?: { message: string; details?: { path: string; message: string }[] };
};

export function ProviderApplicationForm({ reapplying = false }: { reapplying?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const payload = {
      displayName: String(form.get("displayName") ?? ""),
      headline: String(form.get("headline") ?? ""),
      bio: String(form.get("bio") ?? ""),
      website: String(form.get("website") ?? ""),
      country: String(form.get("country") ?? ""),
      yearsTrading: form.get("yearsTrading") ? Number(form.get("yearsTrading")) : undefined,
      performanceFeePct: Number(form.get("performanceFeePct") ?? 0),
      subscriptionPriceMonthly: Number(form.get("subscriptionPriceMonthly") ?? 0),
    };

    try {
      const res = await fetch("/api/provider/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? "Request failed");
        if (json.error?.details) {
          setFieldErrors(Object.fromEntries(json.error.details.map((d) => [d.path, d.message])));
        }
        return;
      }

      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-5">
        <Input
          name="displayName"
          label="Display name"
          required
          maxLength={40}
          placeholder="Gold Desk Capital"
          error={fieldErrors.displayName}
        />
        <Input
          name="headline"
          label="Headline"
          required
          maxLength={120}
          placeholder="Intraday gold scalping with fixed stops"
          error={fieldErrors.headline}
        />

        <div className="space-y-1.5">
          <label htmlFor="bio" className="block text-sm font-medium">
            About your strategy
          </label>
          <textarea
            id="bio"
            name="bio"
            required
            rows={5}
            minLength={50}
            maxLength={2000}
            placeholder="How the strategy works, which sessions it trades, typical holding time, how you manage risk."
            className="panel w-full rounded-lg px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-brand-500"
          />
          {fieldErrors.bio && <p className="text-xs text-red-500">{fieldErrors.bio}</p>}
          <p className="text-xs text-muted">At least 50 characters. Members read this before subscribing.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="website" type="url" label="Website (optional)" placeholder="https://" error={fieldErrors.website} />
          <Input name="country" label="Country code (optional)" maxLength={2} placeholder="TH" error={fieldErrors.country} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input name="yearsTrading" type="number" min={0} max={60} label="Years trading" error={fieldErrors.yearsTrading} />
          <Input
            name="performanceFeePct"
            type="number"
            min={0}
            max={50}
            step="0.5"
            defaultValue={0}
            label="Performance fee %"
            error={fieldErrors.performanceFeePct}
          />
          <Input
            name="subscriptionPriceMonthly"
            type="number"
            min={0}
            step="1"
            defaultValue={0}
            label="Monthly price (USD)"
            error={fieldErrors.subscriptionPriceMonthly}
          />
        </div>

        <p className="text-xs leading-relaxed text-muted">
          Leave both at zero to publish for free. Terms are shown to members before they subscribe,
          and can be changed later while you have no active subscribers.
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" loading={loading}>
          {reapplying ? "Submit new application" : "Submit application"}
        </Button>
      </form>
    </Card>
  );
}
