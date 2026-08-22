import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OwnProviderView } from "@/services/provider.service";

const MESSAGES: Record<OwnProviderView["status"], string> = {
  PENDING: "Your application is in the review queue. We will notify you once it has been reviewed.",
  APPROVED: "You are an approved provider. You can publish strategies from your master account.",
  REJECTED: "This application was not approved. You can address the reason below and apply again.",
  SUSPENDED: "Publishing is currently suspended for this account. Existing subscribers are not receiving new trades.",
};

export function ProviderStatusCard({ profile }: { profile: OwnProviderView }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Provider application</p>
          <p className="mt-1 text-lg font-semibold">{profile.displayName}</p>
        </div>
        <StatusBadge status={profile.status} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted">{MESSAGES[profile.status]}</p>

      {profile.publicReason && (
        <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
          <p className="font-medium">Reviewer feedback</p>
          <p className="mt-1 text-muted">{profile.publicReason}</p>
        </div>
      )}

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Performance fee</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{profile.performanceFeePct}%</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Monthly price</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">
            {profile.subscriptionPriceMonthly === 0 ? "Free" : `$${profile.subscriptionPriceMonthly}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Applied</dt>
          <dd className="mt-1 text-sm font-medium">{profile.appliedAt.toLocaleDateString()}</dd>
        </div>
      </dl>
    </Card>
  );
}
