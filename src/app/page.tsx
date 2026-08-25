import { getCurrentUser } from "@/lib/api-client/auth";
import { apiGetOrFallback } from "@/lib/api-client/server";
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
import { getDictionary, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Plans come from the database, so the page never advertises one that does not
 * exist — but the marketing page still has to render if the API is unreachable,
 * which is why this falls back to an empty list rather than failing the page.
 */
async function loadPlans(): Promise<PublicPlan[]> {
  const { plans } = await apiGetOrFallback<{ plans: PublicPlan[] }>("/api/page-data/landing", { plans: [] });
  return plans;
}

export default async function HomePage() {
  const [user, plans, locale, t] = await Promise.all([
    getCurrentUser(),
    loadPlans(),
    getLocale(),
    getDictionary(),
  ]);

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} locale={locale} t={t.nav} />
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
