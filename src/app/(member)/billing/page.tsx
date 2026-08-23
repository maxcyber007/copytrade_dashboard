import { requireUser } from "@/lib/auth/session";
import { getCurrentSubscription, listPayments, listPlans } from "@/services/subscription.service";
import { BillingPlans } from "@/components/billing/billing-plans";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await requireUser();
  const [plans, subscription, payments] = await Promise.all([
    listPlans(user.id),
    getCurrentSubscription(user.id),
    listPayments(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plan and billing</h1>
        <p className="mt-1 text-sm text-muted">
          Your plan sets how many trading accounts and strategy subscriptions you can run at once.
        </p>
      </div>

      {subscription && (
        <Card>
          <CardHeader
            title={`Current plan: ${subscription.plan.name}`}
            subtitle={
              subscription.currentPeriodEnd
                ? `${subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} ${subscription.currentPeriodEnd.toLocaleDateString()}`
                : undefined
            }
            action={<StatusBadge status={subscription.status} />}
          />
        </Card>
      )}

      <BillingPlans plans={plans} canCancel={Boolean(subscription) && !subscription?.cancelAtPeriodEnd} />

      <Card>
        <CardHeader title="Payments" subtitle="Every charge attempted on this account" />
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" description="Charges appear here once you move to a paid plan." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Plan</Th>
                <Th>Provider</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
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
