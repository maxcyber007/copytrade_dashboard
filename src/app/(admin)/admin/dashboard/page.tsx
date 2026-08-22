import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [members, accounts, strategies] = await Promise.all([
    prisma.user.count({ where: { role: "MEMBER" } }),
    prisma.tradingAccount.count(),
    prisma.strategy.count(),
  ]);

  const stats = [
    { label: "Total members", value: members },
    { label: "Trading accounts", value: accounts },
    { label: "Strategies", value: strategies },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted">Platform-wide counters.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
