import { requireAdmin } from "@/lib/auth/session";
import { listAllStrategies } from "@/services/strategy.service";
import { StrategyAdmin } from "@/components/admin/strategy-admin";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminStrategiesPage() {
  await requireAdmin();
  const strategies = await listAllStrategies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Strategies</h1>
        <p className="mt-1 text-sm text-muted">
          Create platform strategies and decide which provider strategies go live. Pausing a strategy
          stops new trades reaching every subscriber immediately.
        </p>
      </div>

      <StrategyAdmin
        strategies={strategies.map((strategy) => ({
          id: strategy.id,
          code: strategy.code,
          name: strategy.name,
          description: strategy.description,
          status: strategy.status,
          ownerType: strategy.ownerType,
          providerName: strategy.provider?.displayName ?? null,
          masterPlatform: strategy.masterPlatform,
          masterAccountCode: strategy.masterAccountCode,
          minPlanTier: strategy.minPlanTier,
          isPublic: strategy.isPublic,
          subscribers: strategy._count.subscriptions,
          events: strategy._count.tradeEvents,
          totalReturnPct: toNumber(strategy.totalReturnPct),
        }))}
      />
    </div>
  );
}
