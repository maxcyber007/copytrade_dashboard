import { FileText, UserPlus } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { ProviderStrategyManager } from "@/components/strategies/provider-strategy-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { toNumber } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ProviderStrategiesPage() {
  const user = await requireUser();
  const [{ profile, strategies, accounts }, t] = await Promise.all([
    loadPageData("provider-strategies"),
    getDictionary(),
  ]);

  // Only an approved provider can publish; everyone else is sent to apply first.
  if (!profile || profile.status !== "APPROVED") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t.providerPages.myStrategies}</h1>
        <EmptyState
          title={
            profile
              ? t.providerPages.applicationIsTitle.replace("{status}", profile.status)
              : t.providerPages.notProviderTitle
          }
          description={
            profile
              ? t.providerPages.pendingBody
              : t.providerPages.notProviderBody
          }
          action={
            <Link href="/provider/apply">
              <Button>
                {profile ? <FileText className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {profile ? t.providerPages.viewApplication : t.providerPages.applyCta}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.providerPages.myStrategies}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.providerPages.publishingAs}{" "}
          <span className="font-medium">{profile.displayName}</span>
          {t.providerPages.publishingNote}
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
          watchStartedAt: strategy.watchStartedAt,
          watchLastPollAt: strategy.watchLastPollAt,
          subscribers: strategy._count.subscriptions,
          events: strategy._count.tradeEvents,
          totalReturnPct: toNumber(strategy.totalReturnPct),
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
