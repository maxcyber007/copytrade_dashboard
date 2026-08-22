import { requireUser } from "@/lib/auth/session";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted">Signed in as {user.email}</p>
      </div>

      <Card>
        <CardHeader title="Account overview" subtitle="Live metrics appear once a trading account is connected." />
        <EmptyState
          title="No trading account connected yet"
          description="Add and connect an MT4 or MT5 account to see balance, equity, open trades and copy status here."
        />
      </Card>
    </div>
  );
}
