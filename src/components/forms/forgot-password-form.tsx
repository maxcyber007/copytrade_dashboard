"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

export function ForgotPasswordForm() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "") }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? t.auth.requestFailed);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  // The same message either way: whether an address is registered is not
  // something an unauthenticated form should reveal.
  if (sent) {
    return (
      <div className="panel rounded-xl p-4 text-sm">
        <p className="font-medium">{t.auth.checkInbox}</p>
        <p className="mt-1 text-muted">
          {t.auth.checkInboxBody}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input name="email" type="email" label={t.auth.email} required autoComplete="email" />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        <Send className="h-4 w-4" />
        {t.auth.sendResetLink}
      </Button>
    </form>
  );
}
