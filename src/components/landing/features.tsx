import { Activity, GitCompareArrows, KeyRound, LineChart, RefreshCw, ShieldAlert } from "lucide-react";
import { getDictionary } from "@/lib/i18n/server";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

/** Icons stay in code — they are not translated, only paired with copy by order. */
const ICONS = [GitCompareArrows, ShieldAlert, RefreshCw, KeyRound, Activity, LineChart];

export async function Features() {
  const t = await getDictionary();

  return (
    <Section id="features">
      <SectionHeading
        eyebrow={t.features.eyebrow}
        title={t.features.title}
        description={t.features.description}
      />

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {t.features.items.map((feature, index) => {
          const Icon = ICONS[index] ?? GitCompareArrows;
          return (
          <Reveal key={feature.title} delay={(index % 3) * 100}>
            <article className="card-gold h-full rounded-2xl p-6">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ border: "1px solid var(--gold-line)", background: "var(--bg)" }}
              >
                <Icon className="h-[18px] w-[18px]" style={{ color: "var(--gold)" }} />
              </span>
              <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </article>
          </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
