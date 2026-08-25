import Link from "next/link";
import { loadPageData } from "@/lib/api-client/page-data";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getDictionary();
  const { valid } = await loadPageData("reset-password", { token });

  if (!valid) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.invalidTitle}</h1>
        <p className="text-sm text-muted">
          {t.auth.invalidBody}
        </p>
        <Link href="/forgot-password" className="text-sm text-gold hover:underline">
          {t.auth.sendNewLink}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.resetTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.auth.resetSubtitle}
        </p>
      </div>
      <ResetPasswordForm token={token!} />
    </div>
  );
}
