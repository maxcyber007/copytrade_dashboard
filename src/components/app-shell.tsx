import Link from "next/link";
import type { SessionUser } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/landing/logo";

const MEMBER_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/account", label: "Trading Accounts" },
  { href: "/strategies", label: "Strategies" },
  { href: "/history", label: "Copy History" },
  { href: "/performance", label: "Performance" },
  { href: "/billing", label: "Plan & Billing" },
];

const PROVIDER_NAV = [
  { href: "/provider/strategies", label: "My Strategies" },
  { href: "/provider/apply", label: "Provider Profile" },
];

const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/strategies", label: "Strategies" },
  { href: "/admin/copy-trades", label: "Copy Trades" },
  { href: "/admin/errors", label: "System Errors" },
];

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const sections =
    user.role === "ADMIN"
      ? [{ label: "Administration", items: ADMIN_NAV }]
      : [
          { label: "Copying", items: MEMBER_NAV },
          { label: "Publishing", items: PROVIDER_NAV },
        ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="panel shrink-0 border-b lg:min-h-screen lg:w-60 lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">
              CopyTrade <span className="text-gold">Cloud</span>
            </span>
          </Link>
        </div>
        <nav className="flex gap-4 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-5 lg:overflow-visible">
          {sections.map((section) => (
            <div key={section.label} className="flex gap-1 lg:flex-col">
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted lg:block">
                {section.label}
              </p>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-black/5 hover:text-gold dark:hover:bg-white/5"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="panel flex items-center justify-between gap-4 border-b px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
            <p className="text-xs text-muted">{user.role}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
