import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";
import { getDictionary } from "@/lib/i18n/server";

export async function FinalCta() {
  const t = await getDictionary();

  return (
    <section className="relative overflow-hidden px-5 py-24">
      <div className="aura animate-float left-1/2 top-1/2 h-[320px] w-[560px] -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t.cta.titleLead} <span className="gold-text">{t.cta.titleAccent}</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
          {t.cta.body}
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-black transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--gold-soft), var(--gold))" }}
          >
            {t.cta.primary}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/provider/apply"
            className="inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-semibold transition hover:opacity-80"
            style={{ border: "1px solid var(--gold-line)", color: "var(--gold)" }}
          >
            {t.cta.secondary}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
