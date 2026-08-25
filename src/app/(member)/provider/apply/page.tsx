import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { ProviderApplicationForm } from "@/components/forms/provider-application-form";
import { ProviderStatusCard } from "@/components/provider-status-card";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ProviderApplyPage() {
  const user = await requireUser();
  const [{ profile }, t] = await Promise.all([loadPageData("provider-apply"), getDictionary()]);

  // A rejected applicant may submit a fresh application; everyone else with a
  // profile sees its current state instead of the form.
  const showForm = !profile || profile.status === "REJECTED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.providerPages.applyTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.providerPages.applySubtitle}
        </p>
      </div>

      {profile && <ProviderStatusCard profile={profile} />}
      {showForm && <ProviderApplicationForm reapplying={Boolean(profile)} />}
    </div>
  );
}
