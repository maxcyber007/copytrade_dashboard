import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/services/account.service";
import { AccountManager } from "@/components/accounts/account-manager";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireUser();
  const accounts = await listAccounts(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trading accounts</h1>
        <p className="mt-1 text-sm text-muted">
          Add your MT4 or MT5 accounts. Passwords are encrypted before storage and are never shown
          again — not here, not in the API.
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
          currency: account.currency,
          positionMode: account.positionMode,
          connectionStatus: account.connectionStatus,
          copyStatus: account.copyStatus,
          lastError: account.lastError,
          balance: Number(account.balance),
          equity: Number(account.equity),
          openTrades: account.openTrades,
          lastSyncAt: account.lastSyncAt ? account.lastSyncAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
