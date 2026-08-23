import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthForm } from "@/components/forms/auth-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Access your copy trading dashboard.</p>
      </div>
      <AuthForm mode="login" />
      <p className="text-sm text-muted">
        <Link href="/forgot-password" className="text-gold hover:underline">
          Forgot your password?
        </Link>
      </p>
      <p className="text-sm text-muted">
        No account yet?{" "}
        <Link href="/register" className="text-brand-500 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
