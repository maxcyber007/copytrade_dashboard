import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { getDictionary } from "@/lib/i18n/server";

function PointList({ points }: { points: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {points.map((point) => (
        <li key={point} className="flex gap-3 text-sm leading-relaxed">
          <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
          <span className="text-muted">{point}</span>
        </li>
      ))}
    </ul>
  );
}

export async function Audiences() {
  const t = await getDictionary();

  return (
    <Section id="copiers">
      <SectionHeading
        eyebrow={t.audiences.eyebrow}
        title={t.audiences.title}
        description={t.audiences.description}
      />

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <Reveal>
          <article className="card-gold h-full rounded-2xl p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{t.audiences.copierLabel}</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">{t.audiences.copierTitle}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t.audiences.copierBody}
            </p>
            <PointList points={t.audiences.copierPoints} />
            <Link
              href="/register"
              className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--gold)" }}
            >
              {t.audiences.copierCta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </article>
        </Reveal>

        <Reveal delay={120}>
          <article
            id="providers"
            className="card-gold h-full scroll-mt-24 rounded-2xl p-7"
            style={{ borderColor: "var(--gold-line)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>
              {t.audiences.providerLabel}
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">{t.audiences.providerTitle}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t.audiences.providerBody}
            </p>
            <PointList points={t.audiences.providerPoints} />
            <Link
              href="/provider/apply"
              className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--gold)" }}
            >
              {t.audiences.providerCta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </article>
        </Reveal>
      </div>
    </Section>
  );
}
