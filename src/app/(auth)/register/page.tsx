import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/api-client/auth";
import { AuthForm } from "@/components/forms/auth-form";
import { getDictionary } from "@/lib/i18n/server";

export default async function RegisterPage() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (user) redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.registerTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.auth.registerSubtitle}</p>
      </div>
      <AuthForm mode="register" />
      <p className="text-sm text-muted">
        {t.auth.alreadyRegistered}{" "}
        <Link href="/login" className="text-brand-500 hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </div>
  );
}
