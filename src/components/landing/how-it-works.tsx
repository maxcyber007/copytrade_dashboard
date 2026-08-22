import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

const STEPS = [
  {
    step: "01",
    title: "Connect your account",
    body: "Add your MT4 or MT5 login. Credentials are encrypted with AES-256-GCM before they touch the database, and are never displayed again.",
  },
  {
    step: "02",
    title: "Pick a strategy and your risk",
    body: "Choose fixed lot, a multiplier, balance ratio or risk percent. Set max lot, max open trades, daily loss and drawdown limits — they are yours, not the provider's.",
  },
  {
    step: "03",
    title: "Trades copy themselves",
    body: "The provider's master EA publishes each trade to our servers; our workers place it on your account and keep stops, closes and partial closes in sync.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps, then nothing to maintain"
        description="Your terminal never has to be open. The strategy runs on the provider's side; execution runs on ours."
      />

      <ol className="mt-12 grid gap-5 md:grid-cols-3">
        {STEPS.map((item, index) => (
          <Reveal as="li" key={item.step} delay={index * 110}>
            <div className="card-gold h-full rounded-2xl p-6">
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: "var(--gold)" }}
              >
                {item.step}
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
