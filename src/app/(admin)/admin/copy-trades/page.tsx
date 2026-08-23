import { requireAdmin } from "@/lib/auth/session";
import { copyTradeRepository } from "@/repositories/copy-trade.repository";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminCopyTradesPage() {
  await requireAdmin();
  const [trades, counts] = await Promise.all([
    copyTradeRepository.listForAdmin(),
    copyTradeRepository.countByStatus(),
  ]);

  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Copy trades</h1>
        <p className="text-sm text-muted">
          Every attempt across the platform, including the technical error codes members do not see.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(["SUCCESS", "FAILED", "RETRYING", "SKIPPED", "PENDING"] as const).map((status) => (
          <StatCard
            key={status}
            label={status}
            value={byStatus[status] ?? 0}
            tone={status === "SUCCESS" ? "profit" : status === "FAILED" ? "loss" : "neutral"}
          />
        ))}
      </div>

      {trades.length === 0 ? (
        <EmptyState
          title="No copy attempts recorded"
          description="Attempts appear here once the copy engine processes master trade events."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Member</Th>
              <Th>Strategy</Th>
              <Th>Symbol</Th>
              <Th className="text-right">Master / member lot</Th>
              <Th>Master ticket</Th>
              <Th>Member ticket</Th>
              <Th>Status</Th>
              <Th>Error</Th>
              <Th className="text-right">Attempts</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <Td className="whitespace-nowrap text-xs">{trade.createdAt.toLocaleString()}</Td>
                <Td className="text-xs">{trade.account.user.email}</Td>
                <Td>{trade.strategy.code}</Td>
                <Td>{trade.memberSymbol}</Td>
                <Td className="text-right tabular-nums">
                  {toNumber(trade.masterVolume).toFixed(2)} / {toNumber(trade.memberVolume).toFixed(2)}
                </Td>
                <Td className="text-xs">{trade.masterTicket}</Td>
                <Td className="text-xs">{trade.memberTicket ?? "—"}</Td>
                <Td>
                  <StatusBadge status={trade.status} />
                </Td>
                <Td className="max-w-xs text-xs text-muted">
                  {trade.errorCode ? (
                    <>
                      <span className="font-medium">{trade.errorCode}</span>
                      {trade.errorMessage && <span className="block">{trade.errorMessage}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-right tabular-nums">{trade.attempts}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
