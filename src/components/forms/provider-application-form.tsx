"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

type ApiResponse = {
  ok: boolean;
  error?: { message: string; details?: { path: string; message: string }[] };
};

export function ProviderApplicationForm({ reapplying = false }: { reapplying?: boolean }) {
  const router = useRouter();
  const t = useT();
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
      const res = await apiFetch("/api/provider/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? t.auth.requestFailed);
        if (json.error?.details) {
          setFieldErrors(Object.fromEntries(json.error.details.map((d) => [d.path, d.message])));
        }
        return;
      }

      router.refresh();
    } catch {
      setError(t.auth.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-5">
        <Input
          name="displayName"
          label={t.provider.displayName}
          required
          maxLength={40}
          placeholder={t.provider.displayNamePlaceholder}
          error={fieldErrors.displayName}
        />
        <Input
          name="headline"
          label={t.provider.headline}
          required
          maxLength={120}
          placeholder={t.provider.headlinePlaceholder}
          error={fieldErrors.headline}
        />

        <div className="space-y-1.5">
          <label htmlFor="bio" className="block text-sm font-medium">
            {t.provider.about}
          </label>
          <textarea
            id="bio"
            name="bio"
            required
            rows={5}
            minLength={50}
            maxLength={2000}
            placeholder={t.provider.aboutPlaceholder}
            className="panel w-full rounded-lg px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-brand-500"
          />
          {fieldErrors.bio && <p className="text-xs text-red-500">{fieldErrors.bio}</p>}
          <p className="text-xs text-muted">{t.provider.aboutHint}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="website" type="url" label={t.provider.website} placeholder="https://" error={fieldErrors.website} />
          <Input name="country" label={t.provider.country} maxLength={2} placeholder="TH" error={fieldErrors.country} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input name="yearsTrading" type="number" min={0} max={60} label={t.provider.yearsTrading} error={fieldErrors.yearsTrading} />
          <Input
            name="performanceFeePct"
            type="number"
            min={0}
            max={50}
            step="0.5"
            defaultValue={0}
            label={t.provider.performanceFee}
            error={fieldErrors.performanceFeePct}
          />
          <Input
            name="subscriptionPriceMonthly"
            type="number"
            min={0}
            step="1"
            defaultValue={0}
            label={t.provider.monthlyPrice}
            error={fieldErrors.subscriptionPriceMonthly}
          />
        </div>

        <p className="text-xs leading-relaxed text-muted">
          {t.provider.feesNote}
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" loading={loading}>
          <Send className="h-4 w-4" />
          {reapplying ? t.provider.submitNew : t.provider.submit}
        </Button>
      </form>
    </Card>
  );
}
