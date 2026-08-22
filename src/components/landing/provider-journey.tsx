import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

const STAGES = [
  {
    title: "Apply",
    body: "Tell us who you trade for, how the strategy works, and what you want to charge. Takes a few minutes.",
  },
  {
    title: "Get reviewed",
    body: "An admin reviews every application. You are told the outcome and, if it is not approved, exactly why — and you can reapply.",
  },
  {
    title: "Connect your master account",
    body: "Register the MT4 or MT5 account you trade from. Each strategy gets its own signed key for its master EA.",
  },
  {
    title: "Publish and earn",
    body: "Your strategy appears in the marketplace. Members subscribe with their own risk settings; your fee applies to each of them.",
  },
];

export function ProviderJourney() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Provider program"
        title={
          <>
            From application to <span className="gold-text">first subscriber</span>
          </>
        }
        description="Providers keep full control of their strategy. The platform handles distribution, risk enforcement on the copier side, execution and record keeping."
      />

      <div className="relative mt-12">
        <div className="gold-rule absolute left-0 right-0 top-6 hidden h-px lg:block" aria-hidden="true" />
        <ol className="grid gap-6 lg:grid-cols-4">
          {STAGES.map((stage, index) => (
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
