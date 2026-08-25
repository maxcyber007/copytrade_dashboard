import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { AccountManager } from "@/components/accounts/account-manager";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await requireUser();

  // The loader reconciles with the trading provider before reading, so the
  // switches show the provider's actual state rather than only what we last
  // asked for.
  const [{ accounts, followerCounts }, t] = await Promise.all([
    loadPageData("accounts"),
    getDictionary(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.member.accountsTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.member.accountsSubtitle}
        </p>
      </div>

      <AccountManager
        accounts={accounts.map((account) => ({
          id: account.id,
          label: account.label,
          platform: account.platform,
          broker: account.broker,
          login: account.login,
          server: account.server,
          accountType: account.accountType,
          isEnabled: account.isEnabled,
          providerState: account.providerState,
          followerCount: followerCounts[account.id] ?? 0,
          currency: account.currency,
          positionMode: account.positionMode,
          connectionStatus: account.connectionStatus,
          copyStatus: account.copyStatus,
          lastError: account.lastError,
          balance: Number(account.balance),
          equity: Number(account.equity),
          openTrades: account.openTrades,
          lastSyncAt: account.lastSyncAt,
        }))}
      />
    </div>
  );
}
