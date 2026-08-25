import Link from "next/link";
import { ArrowRight, Cpu, ShieldCheck, Zap } from "lucide-react";
import { Reveal } from "./reveal";
import { AiConsole } from "./ai-console";
import { HeroBackdrop } from "./hero-backdrop";
import { getDictionary } from "@/lib/i18n/server";

export async function Hero() {
  const t = await getDictionary();

  return (
    <section id="home" className="relative scroll-mt-24 overflow-hidden">
      {/* layered backdrop: drifting aurora, static grid, perspective floor */}
      <div className="ai-mesh" aria-hidden="true" />
      <div className="grid-backdrop absolute inset-0" aria-hidden="true" />
      <HeroBackdrop />
      <div className="ai-floor" aria-hidden="true" />
      <div className="aura animate-float left-1/2 top-[-140px] h-[420px] w-[680px] -translate-x-1/2" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
            style={{ border: "1px solid var(--gold-line)", color: "var(--gold)" }}
          >
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--gold)" }} />
            {t.hero.badge}
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            {t.hero.titleLead}
            <br />
            <span className="gold-text">{t.hero.titleAccent}</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {t.hero.body}
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-black transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, var(--gold-soft), var(--gold))" }}
            >
              {t.hero.ctaPrimary}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/provider/apply"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition hover:opacity-80"
              style={{ border: "1px solid var(--gold-line)", color: "var(--gold)" }}
            >
              {t.hero.ctaSecondary}
            </Link>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted">
            <li className="inline-flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: "var(--gold)" }} />
              {t.hero.pointTerminal}
            </li>
            <li className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: "var(--gold)" }} />
              {t.hero.pointCredentials}
            </li>
            <li className="inline-flex items-center gap-2">
              <Cpu className="h-4 w-4" style={{ color: "var(--ai-cyan)" }} />
              {t.hero.pointExecution}
            </li>
          </ul>
        </Reveal>

        <Reveal delay={400} className="mt-16">
          <AiConsole />
        </Reveal>
      </div>
    </section>
  );
}
