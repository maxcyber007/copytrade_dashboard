import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getOwnProviderProfile } from "@/services/provider.service";
import { listProviderStrategies } from "@/services/strategy.service";
import { listAccounts } from "@/services/account.service";
import { ProviderStrategyManager } from "@/components/strategies/provider-strategy-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProviderStrategiesPage() {
  const user = await requireUser();
  const profile = await getOwnProviderProfile(user.id);

  // Only an approved provider can publish; everyone else is sent to apply first.
  if (!profile || profile.status !== "APPROVED") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">My strategies</h1>
        <EmptyState
          title={profile ? `Your provider application is ${profile.status}` : "You are not a signal provider yet"}
          description={
            profile
              ? "You can publish strategies once an administrator approves your application."
              : "Apply to publish strategies that other members can copy."
          }
          action={
            <Link href="/provider/apply">
              <Button>{profile ? "View application" : "Apply as a provider"}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const [strategies, accounts] = await Promise.all([
    listProviderStrategies(user.id),
    // The provider's own accounts, offered as publishing sources.
    listAccounts(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My strategies</h1>
        <p className="mt-1 text-sm text-muted">
          Publishing as <span className="font-medium">{profile.displayName}</span>. Each strategy has
          its own master EA key — a key for one strategy can never publish into another. Or publish
          straight from a connected trading account, with no EA and no VPS at all.
        </p>
      </div>

      <ProviderStrategyManager
        strategies={strategies.map((strategy) => ({
          id: strategy.id,
          code: strategy.code,
          name: strategy.name,
          description: strategy.description,
          status: strategy.status,
          masterPlatform: strategy.masterPlatform,
          masterAccountId: strategy.masterAccountId,
          watchStartedAt: strategy.watchStartedAt ? strategy.watchStartedAt.toISOString() : null,
          watchLastPollAt: strategy.watchLastPollAt ? strategy.watchLastPollAt.toISOString() : null,
          subscribers: strategy._count.subscriptions,
          events: strategy._count.tradeEvents,
          totalReturnPct: toNumber(strategy.totalReturnPct),
          keys: strategy.apiKeys.map((key) => ({
            id: key.id,
            keyId: key.keyId,
            label: key.label,
            lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
            createdAt: key.createdAt.toISOString(),
          })),
        }))}
        accounts={accounts.map((account) => ({
          id: account.id,
          label: account.label,
          platform: account.platform,
          login: account.login,
          connectionStatus: account.connectionStatus,
        }))}
      />
    </div>
  );
}
