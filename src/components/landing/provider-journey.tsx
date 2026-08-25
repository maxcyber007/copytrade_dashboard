import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { getDictionary } from "@/lib/i18n/server";

export async function ProviderJourney() {
  const t = await getDictionary();

  return (
    <Section>
      <SectionHeading
        eyebrow={t.journey.eyebrow}
        title={
          <>
            {t.journey.titleLead} <span className="gold-text">{t.journey.titleAccent}</span>
          </>
        }
        description={t.journey.description}
      />

      <div className="relative mt-12">
        <div className="gold-rule absolute left-0 right-0 top-6 hidden h-px lg:block" aria-hidden="true" />
        <ol className="grid gap-6 lg:grid-cols-4">
          {t.journey.stages.map((stage, index) => (
            <Reveal as="li" key={stage.title} delay={index * 110}>
              <div className="relative">
                <span
                  className="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    border: "1px solid var(--gold-line)",
                    color: "var(--gold)",
                    background: "var(--bg)",
                  }}
                >
                  {index + 1}
                </span>
                <h3 className="mt-5 text-base font-semibold">{stage.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{stage.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
