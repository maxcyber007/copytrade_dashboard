import Link from "next/link";
import { Logo } from "./logo";
import { BRAND } from "@/lib/brand";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "#how", label: "How it works" },
      { href: "#features", label: "Features" },
      { href: "#pricing", label: "Pricing" },
      { href: "/api/health", label: "System status" },
    ],
  },
  {
    title: "Providers",
    links: [
      { href: "#providers", label: "Provider program" },
      { href: "/provider/apply", label: "Apply" },
      { href: "/login", label: "Provider sign in" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/register", label: "Create account" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--panel-border)", background: "var(--bg-deep)" }}>
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Logo />
              <span className="text-[15px] font-semibold tracking-tight">
                {BRAND.wordmark.lead} <span className="text-gold">{BRAND.wordmark.accent}</span> {BRAND.wordmark.trail}
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Cloud copy trading for MetaTrader 4 and MetaTrader 5, with a marketplace for members
              who want to publish their own signals.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-muted transition-colors hover:text-gold">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col gap-4 border-t pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--panel-border)" }}
        >
          <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          <p className="max-w-xl leading-relaxed">
            Trading leveraged products carries a high level of risk and can result in the loss of
            your capital. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </footer>
  );
}
