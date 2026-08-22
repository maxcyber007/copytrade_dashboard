import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { Marquee } from "@/components/landing/marquee";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Audiences } from "@/components/landing/audiences";
import { ProviderJourney } from "@/components/landing/provider-journey";
import { Features } from "@/components/landing/features";
import { Pricing, type PublicPlan } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";

export const dynamic = "force-dynamic";

/** Plans come from the database, so the page never advertises a plan that does not exist. */
async function loadPlans(): Promise<PublicPlan[]> {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    });
    return plans.map((plan) => ({
      tier: plan.tier,
      name: plan.name,
      priceMonthly: Number(plan.priceMonthly),
      currency: plan.currency,
      maxAccounts: plan.maxAccounts,
      maxStrategies: plan.maxStrategies,
      features: plan.features,
    }));
  } catch {
    // The marketing page must render even if the database is unreachable.
    return [];
  }
}

export default async function HomePage() {
  const [user, plans] = await Promise.all([getCurrentUser(), loadPlans()]);

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />
      <main>
        <Hero />
        <Marquee />
        <HowItWorks />
        <Audiences />
        <ProviderJourney />
        <Features />
        <Pricing plans={plans} />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
