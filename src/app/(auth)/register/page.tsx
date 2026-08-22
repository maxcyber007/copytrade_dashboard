import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthForm } from "@/components/forms/auth-form";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-muted">Start copying strategies in a few minutes.</p>
      </div>
      <AuthForm mode="register" />
      <p className="text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="text-brand-500 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
