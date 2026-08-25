import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { BillingPlans } from "@/components/billing/billing-plans";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, toNumber } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await requireUser();
  const [{ plans, subscription, payments }, t] = await Promise.all([
    loadPageData("billing"),
    getDictionary(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.member.billingTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.member.billingSubtitle}
        </p>
      </div>

      {subscription && (
        <Card>
          <CardHeader
            title={t.member.currentPlan.replace("{name}", subscription.plan.name)}
            subtitle={
              subscription.currentPeriodEnd
                ? (subscription.cancelAtPeriodEnd ? t.member.ends : t.member.renews).replace(
                    "{date}",
                    formatDate(subscription.currentPeriodEnd) ?? "",
                  )
                : undefined
            }
            action={<StatusBadge status={subscription.status} />}
          />
        </Card>
      )}

      <BillingPlans plans={plans} canCancel={Boolean(subscription) && !subscription?.cancelAtPeriodEnd} />

      <Card>
        <CardHeader title={t.member.payments} subtitle={t.member.paymentsSubtitle} />
        {payments.length === 0 ? (
          <EmptyState title={t.member.noPaymentsTitle} description={t.member.noPaymentsBody} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.member.thDate}</Th>
                <Th>{t.member.thPlan}</Th>
                <Th>{t.member.thProvider}</Th>
                <Th className="text-right">{t.member.thAmount}</Th>
                <Th>{t.member.thStatus}</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <Td className="whitespace-nowrap text-xs">{payment.createdAt.toLocaleString()}</Td>
                  <Td>{payment.plan?.name ?? "—"}</Td>
                  <Td className="text-xs">{payment.provider}</Td>
                  <Td className="text-right tabular-nums">
                    {formatCurrency(toNumber(payment.amount), payment.currency)}
                  </Td>
                  <Td>
                    <StatusBadge status={payment.status} />
                    {payment.failureReason && (
                      <span className="block text-xs text-muted">{payment.failureReason}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
