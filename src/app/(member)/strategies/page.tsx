import { requireUser } from "@/lib/auth/session";
import { listPublicStrategies } from "@/services/strategy.service";
import { listAccounts } from "@/services/account.service";
import { listSubscriptions } from "@/services/copy.service";
import { StrategyBrowser } from "@/components/strategies/strategy-browser";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StrategiesPage() {
  const user = await requireUser();
  const [strategies, accounts, subscriptions] = await Promise.all([
    listPublicStrategies(),
    listAccounts(user.id),
    listSubscriptions(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Strategies</h1>
        <p className="mt-1 text-sm text-muted">
          Subscribe an account to a strategy and set how much of each trade reaches you.
        </p>
      </div>

      <StrategyBrowser
        strategies={strategies.map((strategy) => ({
          id: strategy.id,
          code: strategy.code,
          name: strategy.name,
          description: strategy.description,
          status: strategy.status,
          masterPlatform: strategy.masterPlatform,
          ownerType: strategy.ownerType,
          providerName: strategy.provider?.displayName ?? "Platform",
          performanceFeePct: toNumber(strategy.provider?.performanceFeePct ?? 0),
          subscriptionPriceMonthly: toNumber(strategy.provider?.subscriptionPriceMonthly ?? 0),
          totalReturnPct: toNumber(strategy.totalReturnPct),
          maxDrawdownPct: toNumber(strategy.maxDrawdownPct),
          winRatePct: toNumber(strategy.winRatePct),
          totalTrades: strategy.totalTrades,
          memberCount: strategy.memberCount,
        }))}
        accounts={accounts.map((account) => ({
          id: account.id,
          label: account.label,
          platform: account.platform,
          connectionStatus: account.connectionStatus,
        }))}
        subscriptions={subscriptions.map((subscription) => ({
          id: subscription.id,
          strategyId: subscription.strategyId,
          strategyName: subscription.strategy.name,
          accountId: subscription.accountId,
          accountLabel: subscription.account.label,
          copyStatus: subscription.copyStatus,
          lotMode: subscription.copySettings?.lotMode ?? "MULTIPLIER",
          multiplier: toNumber(subscription.copySettings?.multiplier ?? 1),
          fixedLot: toNumber(subscription.copySettings?.fixedLot ?? 0.01),
          riskPercent: toNumber(subscription.copySettings?.riskPercent ?? 1),
          maxOpenTrades: subscription.copySettings?.maxOpenTrades ?? 20,
          maxDrawdownPct: toNumber(subscription.riskProfile?.maxDrawdownPct ?? 0),
        }))}
      />
    </div>
  );
}
