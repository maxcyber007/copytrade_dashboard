import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { getDictionary } from "@/lib/i18n/server";

export async function HowItWorks() {
  const t = await getDictionary();

  return (
    <Section id="how">
      <SectionHeading
        eyebrow={t.how.eyebrow}
        title={t.how.title}
        description={t.how.description}
      />

      <ol className="mt-12 grid gap-5 md:grid-cols-3">
        {t.how.steps.map((item, index) => (
          <Reveal as="li" key={item.title} delay={index * 110}>
            <div className="card-gold h-full rounded-2xl p-6">
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: "var(--gold)" }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
