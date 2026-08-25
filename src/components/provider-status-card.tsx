import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OwnProviderView } from "@/services/provider.service";
import type { Serialized } from "@/lib/serialize";
import { getDictionary } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";

/**
 * Rendered from data that arrived over HTTP, so dates are ISO strings here
 * rather than `Date`. `Serialized` keeps that in step with the service type
 * automatically instead of restating the shape.
 */
export async function ProviderStatusCard({ profile }: { profile: Serialized<OwnProviderView> }) {
  const t = await getDictionary();

  const messages: Record<OwnProviderView["status"], string> = {
    PENDING: t.providerStatus.pending,
    APPROVED: t.providerStatus.approved,
    REJECTED: t.providerStatus.rejected,
    SUSPENDED: t.providerStatus.suspended,
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{t.providerStatus.heading}</p>
          <p className="mt-1 text-lg font-semibold">{profile.displayName}</p>
        </div>
        <StatusBadge status={profile.status} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted">{messages[profile.status]}</p>

      {profile.publicReason && (
        <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
          <p className="font-medium">{t.providerStatus.feedback}</p>
          <p className="mt-1 text-muted">{profile.publicReason}</p>
        </div>
      )}

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t.providerStatus.performanceFee}</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{profile.performanceFeePct}%</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t.providerStatus.monthlyPrice}</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">
            {profile.subscriptionPriceMonthly === 0 ? t.common.free : `$${profile.subscriptionPriceMonthly}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t.providerStatus.applied}</dt>
          <dd className="mt-1 text-sm font-medium">{formatDate(profile.appliedAt)}</dd>
        </div>
      </dl>
    </Card>
  );
}
