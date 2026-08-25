import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, toNumber } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  await requireAdmin();
  const [{ accounts }, t] = await Promise.all([loadPageData("admin/accounts"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.accountsTitle}</h1>
        <p className="text-sm text-muted">
          {t.admin.accountsSubtitle}
        </p>
      </div>

      {accounts.length === 0 ? (
        <EmptyState title={t.admin.noAccounts} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.admin.thOwner}</Th>
              <Th>{t.admin.thAccount}</Th>
              <Th>{t.admin.thPlatform}</Th>
              <Th>{t.admin.thMode}</Th>
              <Th>{t.admin.thConnection}</Th>
              <Th>{t.admin.thCopy}</Th>
              <Th className="text-right">{t.admin.thEquity}</Th>
              <Th className="text-right">{t.admin.thOpen}</Th>
              <Th>{t.admin.thLastSync}</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <Td className="text-xs">{account.user.email}</Td>
                <Td>
                  <span className="font-medium">{account.label}</span>
                  <span className="block text-xs text-muted">
                    {account.broker} · {account.login}
                  </span>
                </Td>
                <Td>{account.platform}</Td>
                <Td className="text-xs">{account.positionMode}</Td>
                <Td>
                  <StatusBadge status={account.connectionStatus} />
                  {account.lastError && <span className="mt-1 block text-xs text-red-500">{account.lastError}</span>}
                </Td>
                <Td>
                  <StatusBadge status={account.copyStatus} />
                </Td>
                <Td className="text-right tabular-nums">
                  {formatCurrency(toNumber(account.equity), account.currency)}
                </Td>
                <Td className="text-right tabular-nums">{account.openTrades}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {account.lastSyncAt ? account.lastSyncAt.toLocaleString() : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
