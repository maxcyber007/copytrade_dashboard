import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { StrategyAdmin } from "@/components/admin/strategy-admin";
import { toNumber } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminStrategiesPage() {
  await requireAdmin();
  const [{ strategies }, t] = await Promise.all([loadPageData("admin/strategies"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.strategiesTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.admin.strategiesSubtitle}
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
