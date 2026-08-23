import Link from "next/link";
import { isResetTokenValid } from "@/services/password-reset.service";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = Boolean(token && token.length >= 20 && (await isResetTokenValid(token)));

  if (!valid) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">This link is no longer valid</h1>
        <p className="text-sm text-muted">
          Reset links can be used once and expire quickly. Request a new one and it will arrive in a
          moment.
        </p>
        <Link href="/forgot-password" className="text-sm text-gold hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">
          Setting it signs you out everywhere, so any other session ends immediately.
        </p>
      </div>
      <ResetPasswordForm token={token!} />
    </div>
  );
}
