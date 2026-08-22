import { requireUser } from "@/lib/auth/session";
import { getOwnProviderProfile } from "@/services/provider.service";
import { ProviderApplicationForm } from "@/components/forms/provider-application-form";
import { ProviderStatusCard } from "@/components/provider-status-card";

export const dynamic = "force-dynamic";

export default async function ProviderApplyPage() {
  const user = await requireUser();
  const profile = await getOwnProviderProfile(user.id);

  // A rejected applicant may submit a fresh application; everyone else with a
  // profile sees its current state instead of the form.
  const showForm = !profile || profile.status === "REJECTED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Become a signal provider</h1>
        <p className="mt-1 text-sm text-muted">
          Publish strategies other members can copy, and set your own terms. Every application is
          reviewed by an administrator before a strategy can go live.
        </p>
      </div>

      {profile && <ProviderStatusCard profile={profile} />}
      {showForm && <ProviderApplicationForm reapplying={Boolean(profile)} />}
    </div>
  );
}
