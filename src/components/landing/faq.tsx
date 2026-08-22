import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

const FAQS = [
  {
    q: "Do I need a VPS or an EA on my computer?",
    a: "No. The strategy runs on the provider's master account and publishes its trades to our servers. Execution on your account happens in our infrastructure, so your terminal can stay closed.",
  },
  {
    q: "Does this work with MT4, or only MT5?",
    a: "Both. The platform is your account's property, not a separate product — an MT5 master can be copied to MT4 members and the other way around. Broker symbol names and lot steps are mapped per account.",
  },
  {
    q: "What happens to my password?",
    a: "It is encrypted with AES-256-GCM before storage, decrypted only in memory when a connection is established, and never logged, returned by the API, or displayed again.",
  },
  {
    q: "Can a provider blow up my account?",
    a: "Your risk settings belong to you. Max lot, max open trades, allowed symbols, daily loss and maximum drawdown are enforced on your side, and copying pauses when a limit is breached.",
  },
  {
    q: "Who can become a signal provider?",
    a: "Any member can apply. Applications are reviewed by an admin, and only approved providers can publish a live strategy. If your application is rejected you are told why and can apply again.",
  },
  {
    q: "How do providers get paid?",
    a: "A provider sets a performance fee, a monthly subscription price, or both — and can publish for free. Members see the terms before subscribing, and provider earnings are recorded per period.",
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow="FAQ" title="Questions worth asking first" align="center" />

      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {FAQS.map((item, index) => (
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
