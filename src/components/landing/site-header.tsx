"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Nav = Dictionary["nav"];

export function SiteHeader({
  signedIn,
  locale,
  t,
}: {
  signedIn: boolean;
  locale: Locale;
  t: Nav;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const links = [
    { href: "#home", label: t.home },
    { href: "#how", label: t.how },
    { href: "#copiers", label: t.copiers },
    { href: "#providers", label: t.providers },
    { href: "#pricing", label: t.pricing },
    { href: "#faq", label: t.faq },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled && "backdrop-blur-xl",
      )}
      style={
        scrolled
          ? { background: "color-mix(in srgb, var(--bg) 82%, transparent)", borderBottom: "1px solid var(--panel-border)" }
          : undefined
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">
            {BRAND.wordmark.lead} <span className="text-gold">{BRAND.wordmark.accent}</span> {BRAND.wordmark.trail}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex xl:gap-7">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-gold"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} label={t.language} />
          <ThemeToggle label={t.toggleTheme} />
          {signedIn ? (
            <Link
              href="/dashboard"
              className="rounded-lg px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, var(--gold-soft), var(--gold))" }}
            >
              {t.dashboard}
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm text-muted transition hover:text-gold sm:block">
                {t.signIn}
              </Link>
              <Link
                href="/register"
                className="rounded-lg px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, var(--gold-soft), var(--gold))" }}
              >
                {t.getStarted}
              </Link>
            </>
          )}
          <button
            type="button"
            aria-label={t.openMenu}
            onClick={() => setOpen((v) => !v)}
            className="panel inline-flex h-9 w-9 items-center justify-center rounded-lg lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="panel border-t lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-5 py-2">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b py-3 text-sm text-muted last:border-b-0"
                style={{ borderColor: "var(--panel-border)" }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
