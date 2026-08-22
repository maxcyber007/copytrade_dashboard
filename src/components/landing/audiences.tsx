import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

const COPIER_POINTS = [
  "MT4 and MT5, hedging or netting accounts",
  "Four lot modes: fixed, multiplier, balance ratio, risk percent",
  "Daily loss and drawdown limits that pause copying automatically",
  "Symbol mapping for broker suffixes such as XAUUSD.a or GOLD",
  "Every copy recorded with latency, provider response and error code",
];

const PROVIDER_POINTS = [
  "Publish from your own MT4 or MT5 master account",
  "Set a performance fee, a monthly price, or publish for free",
  "Your own signed API key per strategy — revocable, never shared",
  "Subscriber count and strategy performance in one dashboard",
  "Pause a strategy and choose whether open positions stay or close",
];

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

export function Audiences() {
  return (
    <Section id="copiers">
      <SectionHeading
        eyebrow="Two sides, one platform"
        title="Copy a strategy — or become the strategy"
        description="Every member starts as a copier. Members with a track record can apply to publish, and keep trading their own account exactly as before."
      />

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <Reveal>
          <article className="card-gold h-full rounded-2xl p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">For copiers</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">Follow a strategy on your terms</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The provider decides what to trade. You decide how much of it reaches your account.
            </p>
            <PointList points={COPIER_POINTS} />
            <Link
              href="/register"
              className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--gold)" }}
            >
              Create a free account
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
              For signal providers
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">Turn your trading into income</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Apply once, get reviewed by our team, then publish strategies members can subscribe to.
            </p>
            <PointList points={PROVIDER_POINTS} />
            <Link
              href="/provider/apply"
              className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--gold)" }}
            >
              Apply as a provider
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </article>
        </Reveal>
      </div>
    </Section>
  );
}
