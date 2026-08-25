import Link from "next/link";
import { Cpu, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Logo } from "@/components/landing/logo";
import { AuthVisual } from "@/components/auth/auth-visual";
import { getDictionary, getLocale } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);

  const points = [
    { icon: Cpu, label: t.authPanel.pointLatency },
    { icon: SlidersHorizontal, label: t.authPanel.pointRisk },
    { icon: ShieldCheck, label: t.authPanel.pointSecurity },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* atmosphere, shared with the landing page so the two feel continuous */}
      <div className="ai-mesh" aria-hidden="true" />
      <div className="grid-backdrop absolute inset-0" aria-hidden="true" />
      <div className="ai-floor" aria-hidden="true" />
      <div
        className="aura animate-float left-[-120px] top-[-160px] h-[460px] w-[560px]"
        aria-hidden="true"
      />

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        {/* --- brand panel (large screens only) --- */}
        <aside className="hidden w-1/2 flex-col justify-between px-12 py-10 lg:flex xl:px-16">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">
              {BRAND.wordmark.lead} <span className="text-gold">{BRAND.wordmark.accent}</span>{" "}
              {BRAND.wordmark.trail}
            </span>
          </Link>

          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
              {t.authPanel.headlineLead}{" "}
              <span className="gold-text">{t.authPanel.headlineAccent}</span>
            </h2>

            <p className="mt-5 text-sm leading-relaxed text-muted">{t.authPanel.subline}</p>

            <ul className="mt-8 space-y-3.5">
              {points.map((point) => (
                <li key={point.label} className="flex items-start gap-3 text-sm text-muted">
                  <span
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ border: "1px solid var(--gold-line)", background: "var(--bg)" }}
                  >
                    <point.icon className="h-3.5 w-3.5" style={{ color: "var(--gold)" }} />
                  </span>
                  {point.label}
                </li>
              ))}
            </ul>
          </div>

          <AuthVisual className="h-52 w-full max-w-md opacity-90" />
        </aside>

        {/* --- form column --- */}
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 px-6 py-5">
            <Link href="/" className="flex items-center gap-2.5 lg:hidden">
              <Logo className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-tight">
                {BRAND.wordmark.lead} <span className="text-gold">{BRAND.wordmark.accent}</span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitcher locale={locale} label={t.nav.language} />
              <ThemeToggle label={t.nav.toggleTheme} />
            </div>
          </header>

          <main className="flex flex-1 items-center justify-center px-6 pb-16">
            <div className="beam-border w-full max-w-md rounded-2xl">
              <div className="beam-inner rounded-2xl px-7 py-8 sm:px-9">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
