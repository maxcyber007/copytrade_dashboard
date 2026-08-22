import { Activity, GitCompareArrows, KeyRound, LineChart, RefreshCw, ShieldAlert } from "lucide-react";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

const FEATURES = [
  {
    icon: GitCompareArrows,
    title: "Position mapping that survives edits",
    body: "Each master ticket is mapped to your ticket, so a later stop-loss change or partial close lands on the right position — including MT4's ticket remap on partial close.",
  },
  {
    icon: ShieldAlert,
    title: "Risk limits that actually stop trading",
    body: "Daily loss, drawdown, max open trades, max lot and an allowed-symbol list. Breaching a limit pauses copying instead of quietly continuing.",
  },
  {
    icon: RefreshCw,
    title: "Retries that cannot double-open",
    body: "Failed orders retry with exponential backoff, but every retry re-checks live positions first. A duplicate event is rejected by a database constraint, not by hope.",
  },
  {
    icon: KeyRound,
    title: "Signed master events",
    body: "Trade events require an API key, an HMAC signature over the raw body, a fresh timestamp and a unique event id. A replayed request is refused.",
  },
  {
    icon: Activity,
    title: "Every attempt on the record",
    body: "Copy history stores master and member ticket, both lots and prices, latency, status and error code. HTTP 200 is never treated as a fill.",
  },
  {
    icon: LineChart,
    title: "Performance you can audit",
    body: "Equity curve, daily and monthly profit, drawdown, win rate and profit factor — computed from your own copy results, with an empty state until there is data.",
  },
];

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Built for real money"
        title="The parts that matter when an order is live"
        description="Copy trading is easy to demo and hard to get right. These are the mechanics that decide whether a copied trade is correct."
      />

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal key={feature.title} delay={(index % 3) * 100}>
            <article className="card-gold h-full rounded-2xl p-6">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ border: "1px solid var(--gold-line)", background: "var(--bg)" }}
              >
                <feature.icon className="h-[18px] w-[18px]" style={{ color: "var(--gold)" }} />
              </span>
              <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
