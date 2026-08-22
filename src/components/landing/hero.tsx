import Link from "next/link";
import { ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Reveal } from "./reveal";
import { DashboardPreview } from "./dashboard-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="grid-backdrop absolute inset-0" aria-hidden="true" />
      <div className="aura animate-float left-1/2 top-[-140px] h-[420px] w-[680px] -translate-x-1/2" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
            style={{ border: "1px solid var(--gold-line)", color: "var(--gold)" }}
          >
            <span className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--gold)" }} />
            MetaTrader 4 &amp; MetaTrader 5 — copy and publish
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Copy trades from the cloud.
            <br />
            <span className="gold-text">Or get paid to publish them.</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Connect your MT4 or MT5 account, choose a strategy and set your own risk — no VPS to
            rent, no EA to install, no terminal left running. Trading your own edge? Apply as a
            signal provider and earn from every member who copies you.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-black transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, var(--gold-soft), var(--gold))" }}
            >
              Start copying free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/provider/apply"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition hover:opacity-80"
              style={{ border: "1px solid var(--gold-line)", color: "var(--gold)" }}
            >
              Become a signal provider
            </Link>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted">
            <li className="inline-flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: "var(--gold)" }} />
              Runs while your terminal is closed
            </li>
            <li className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: "var(--gold)" }} />
              Credentials encrypted, never shown again
            </li>
          </ul>
        </Reveal>

        <Reveal delay={400} className="mt-16">
          <DashboardPreview />
        </Reveal>
      </div>
    </section>
  );
}
