import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">CopyTrade Cloud</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="secondary" size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Copy strategies from the cloud — no VPS, no EA on your machine.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted">
          Connect your MetaTrader 4 or MetaTrader 5 account, pick a strategy, set your risk, and start copying.
          The master EA runs on our infrastructure; your terminal does not have to stay open.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register">
            <Button size="lg">Create account</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">Sign in</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
