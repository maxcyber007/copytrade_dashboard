import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, toNumber } from "@/lib/utils";
import { LiveUpdates } from "@/components/live/live-updates";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser();
  const [{ trades }, t] = await Promise.all([loadPageData("history"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.member.historyTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            {t.member.historySubtitle}
          </p>
        </div>
        <LiveUpdates showToasts={false} />
      </div>

      {trades.length === 0 ? (
        <EmptyState
          title={t.member.historyEmptyTitle}
          description={t.member.historyEmptyBody}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.member.thDate}</Th>
              <Th>{t.member.thStrategy}</Th>
              <Th>{t.member.thAccount}</Th>
              <Th>{t.member.thSymbol}</Th>
              <Th>{t.member.thEvent}</Th>
              <Th>{t.member.thType}</Th>
              <Th className="text-right">{t.member.thMasterLot}</Th>
              <Th className="text-right">{t.member.thYourLot}</Th>
              <Th className="text-right">{t.member.thProfit}</Th>
              <Th>{t.member.thStatus}</Th>
              <Th className="text-right">{t.member.thLatency}</Th>
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
                    <span className="block text-xs text-muted">{t.member.masterPrefix} {trade.masterSymbol}</span>
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
