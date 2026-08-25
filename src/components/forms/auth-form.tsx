"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

type Mode = "login" | "register";

type ApiResponse = {
  ok: boolean;
  data?: { user: { role: "ADMIN" | "MEMBER" } };
  error?: { message: string; details?: { path: string; message: string }[] };
};

export function AuthForm({ mode }: { mode: Mode }) {
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
    const payload =
      mode === "register"
        ? {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
            name: String(form.get("name") ?? "") || undefined,
          }
        : { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };

    try {
      const res = await apiFetch(`/api/auth/${mode}`, {
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

      router.replace(json.data?.user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
      router.refresh();
    } catch {
      setError(t.auth.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "register" && <Input name="name" label={t.auth.name} autoComplete="name" error={fieldErrors.name} />}
      <Input
        name="email"
        type="email"
        label={t.auth.email}
        required
        autoComplete="email"
        error={fieldErrors.email}
      />
      <Input
        name="password"
        type="password"
        label={t.auth.password}
        required
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        error={fieldErrors.password}
      />
      {mode === "register" && (
        <p className="text-xs text-muted">
          {t.auth.passwordHint}
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        {mode === "register" ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
        {mode === "register" ? t.auth.createAccount : t.auth.signIn}
      </Button>
    </form>
  );
}
