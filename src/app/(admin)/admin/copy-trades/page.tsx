import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { toNumber } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminCopyTradesPage() {
  await requireAdmin();
  const [{ trades, counts }, t] = await Promise.all([
    loadPageData("admin/copy-trades"),
    getDictionary(),
  ]);

  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row._count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.copyTradesTitle}</h1>
        <p className="text-sm text-muted">
          {t.admin.copyTradesSubtitle}
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
          title={t.admin.noCopyAttempts}
          description={t.admin.noCopyAttemptsBody}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.admin.thDate}</Th>
              <Th>{t.admin.thMember}</Th>
              <Th>{t.admin.thStrategy}</Th>
              <Th>{t.admin.thSymbol}</Th>
              <Th>{t.admin.thEvent}</Th>
              <Th className="text-right">{t.admin.thLots}</Th>
              <Th>{t.admin.thMasterTicket}</Th>
              <Th>{t.admin.thMemberTicket}</Th>
              <Th>{t.admin.thStatus}</Th>
              <Th>{t.admin.thError}</Th>
              <Th className="text-right">{t.admin.thAttempts}</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <Td className="whitespace-nowrap text-xs">{trade.createdAt.toLocaleString()}</Td>
                <Td className="text-xs">{trade.account.user.email}</Td>
                <Td>{trade.strategy.code}</Td>
                <Td>{trade.memberSymbol}</Td>
                <Td className="text-xs">{trade.eventType}</Td>
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
