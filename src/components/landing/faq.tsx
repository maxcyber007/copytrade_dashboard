import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { getDictionary } from "@/lib/i18n/server";

export async function Faq() {
  const t = await getDictionary();

  return (
    <Section id="faq">
      <SectionHeading eyebrow={t.faq.eyebrow} title={t.faq.title} align="center" />

      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {t.faq.items.map((item, index) => (
          <Reveal key={item.q} delay={index * 60}>
            <details className="card-gold group rounded-xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium">
                {item.q}
                <span
                  className="shrink-0 text-lg leading-none transition-transform duration-300 group-open:rotate-45"
                  style={{ color: "var(--gold)" }}
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
