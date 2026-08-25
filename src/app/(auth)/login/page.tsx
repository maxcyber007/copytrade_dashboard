import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/api-client/auth";
import { AuthForm } from "@/components/forms/auth-form";
import { getDictionary } from "@/lib/i18n/server";

export default async function LoginPage() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (user) redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signInTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.auth.signInSubtitle}</p>
      </div>
      <AuthForm mode="login" />
      <p className="text-sm text-muted">
        <Link href="/forgot-password" className="text-gold hover:underline">
          {t.auth.forgotLink}
        </Link>
      </p>
      <p className="text-sm text-muted">
        {t.auth.noAccount}{" "}
        <Link href="/register" className="text-brand-500 hover:underline">
          {t.auth.createOne}
        </Link>
      </p>
    </div>
  );
}
