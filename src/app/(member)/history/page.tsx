import { requireUser } from "@/lib/auth/session";
import { copyTradeRepository } from "@/repositories/copy-trade.repository";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser();
  const trades = await copyTradeRepository.listForUser(user.id, { take: 100 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Copy history</h1>
        <p className="mt-1 text-sm text-muted">
          Every copy attempt, successful or not, with the lots and prices on both sides.
        </p>
      </div>

      {trades.length === 0 ? (
        <EmptyState
          title="No copied trades yet"
          description="Once a strategy you follow opens a trade, every attempt appears here with its status, latency and any error."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Strategy</Th>
              <Th>Account</Th>
              <Th>Symbol</Th>
              <Th>Event</Th>
              <Th>Type</Th>
              <Th className="text-right">Master lot</Th>
              <Th className="text-right">Your lot</Th>
              <Th className="text-right">Profit</Th>
              <Th>Status</Th>
              <Th className="text-right">Latency</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <Td className="whitespace-nowrap text-xs">{trade.createdAt.toLocaleString()}</Td>
                <Td>{trade.strategy.name}</Td>
                <Td>{trade.account.label}</Td>
                <Td>
                  {trade.memberSymbol}
                  {trade.masterSymbol !== trade.memberSymbol && (
                    <span className="block text-xs text-muted">master: {trade.masterSymbol}</span>
                  )}
                </Td>
                <Td className="text-xs">{trade.eventType}</Td>
                <Td>{trade.orderType}</Td>
                <Td className="text-right tabular-nums">{toNumber(trade.masterVolume).toFixed(2)}</Td>
                <Td className="text-right tabular-nums">{toNumber(trade.memberVolume).toFixed(2)}</Td>
                <Td className="text-right tabular-nums">
                  {trade.profit === null ? "—" : formatCurrency(toNumber(trade.profit))}
                </Td>
                <Td>
                  <StatusBadge status={trade.status} />
                  {/* Members see the mapped message, not the provider's raw error. */}
                  {trade.skipReason && <span className="block text-xs text-muted">{trade.skipReason}</span>}
                </Td>
                <Td className="text-right tabular-nums">{trade.latencyMs === null ? "—" : `${trade.latencyMs} ms`}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
