import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { EmptyState } from "@/components/ui/empty-state";

export type PublicPlan = {
  tier: string;
  name: string;
  priceMonthly: number;
  currency: string;
  maxAccounts: number;
  maxStrategies: number;
  features: string[];
};

const HIGHLIGHT = "PRO";

export function Pricing({ plans }: { plans: PublicPlan[] }) {
  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="Start free, upgrade when you add accounts"
        description="Plans limit how many trading accounts and strategies you run at once. Provider fees are set by each provider and shown before you subscribe."
        align="center"
      />

      {plans.length === 0 ? (
        <Reveal className="mt-12">
          <EmptyState
            title="Plans are not published yet"
            description="Subscription plans appear here once they are configured."
          />
        </Reveal>
      ) : (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, index) => {
            const featured = plan.tier === HIGHLIGHT;
            return (
              <Reveal key={plan.tier} delay={index * 90}>
                <article
                  className="card-gold flex h-full flex-col rounded-2xl p-6"
                  style={featured ? { borderColor: "var(--gold-line)", boxShadow: "0 0 0 1px var(--gold-line)" } : undefined}
                >
                  {featured && (
                    <span
                      className="mb-3 inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ background: "var(--gold-glow)", color: "var(--gold)" }}
                    >
                      Most popular
                    </span>
                  )}
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tabular-nums">
                      {plan.priceMonthly === 0 ? "Free" : `$${plan.priceMonthly}`}
                    </span>
                    {plan.priceMonthly > 0 && <span className="text-sm text-muted">/mo</span>}
                  </p>

                  <ul className="mt-5 space-y-2.5 text-sm">
                    <li className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                      <span className="text-muted">
                        {plan.maxAccounts} trading {plan.maxAccounts === 1 ? "account" : "accounts"}
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                      <span className="text-muted">
                        {plan.maxStrategies} {plan.maxStrategies === 1 ? "strategy" : "strategies"} at a time
                      </span>
                    </li>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                        <span className="text-muted">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/register"
                    className="mt-7 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
                    style={
                      featured
                        ? { background: "linear-gradient(135deg, var(--gold-soft), var(--gold))", color: "#000" }
                        : { border: "1px solid var(--panel-border)" }
                    }
                  >
                    Get started
                  </Link>
                </article>
              </Reveal>
            );
          })}
        </div>
      )}
    </Section>
  );
}
