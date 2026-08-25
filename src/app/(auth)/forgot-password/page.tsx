import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { getDictionary } from "@/lib/i18n/server";

export default async function ForgotPasswordPage() {
  const t = await getDictionary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.forgotTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.auth.forgotSubtitle}
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-sm text-muted">
        {t.auth.remembered}{" "}
        <Link href="/login" className="text-gold hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </div>
  );
}
