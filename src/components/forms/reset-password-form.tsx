"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

export function ResetPasswordForm({ token }: { token: string }) {
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
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password !== confirm) {
      setFieldErrors({ confirm: t.auth.passwordsDoNotMatch });
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: { message: string; details?: { path: string; message: string }[] };
      };

      if (!res.ok || !json.ok) {
        if (json.error?.details) {
          setFieldErrors(Object.fromEntries(json.error.details.map((d) => [d.path, d.message])));
        }
        throw new Error(json.error?.message ?? t.auth.couldNotReset);
      }

      router.replace("/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.couldNotReset);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        name="password"
        type="password"
        label={t.auth.newPassword}
        required
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <Input
        name="confirm"
        type="password"
        label={t.auth.confirmPassword}
        required
        autoComplete="new-password"
        error={fieldErrors.confirm}
      />
      <p className="text-xs text-muted">
        {t.auth.passwordHint}
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        <KeyRound className="h-4 w-4" />
        {t.auth.setNewPassword}
      </Button>
    </form>
  );
}
