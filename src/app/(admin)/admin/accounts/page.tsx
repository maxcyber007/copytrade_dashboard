import { requireAdmin } from "@/lib/auth/session";
import { accountRepository } from "@/repositories/account.repository";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  await requireAdmin();
  const accounts = await accountRepository.listForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trading accounts</h1>
        <p className="text-sm text-muted">
          Connection and copy state across every member. Credentials are never loaded here.
        </p>
      </div>

      {accounts.length === 0 ? (
        <EmptyState title="No trading accounts yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Owner</Th>
              <Th>Account</Th>
              <Th>Platform</Th>
              <Th>Mode</Th>
              <Th>Connection</Th>
              <Th>Copy</Th>
              <Th className="text-right">Equity</Th>
              <Th className="text-right">Open</Th>
              <Th>Last sync</Th>
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
