import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getAccount } from "@/services/account.service";
import { positionRepository } from "@/repositories/position.repository";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatLot, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** How a close is described to the member, rather than by the broker's code. */
const CLOSE_REASON_LABEL: Record<string, string> = {
  STOP_LOSS: "Stop loss",
  TAKE_PROFIT: "Take profit",
  COPIED_CLOSE: "Master closed",
  MANUAL: "Closed by you",
  OTHER: "Closed at broker",
};

/**
 * Prices, at the precision the instrument actually uses.
 *
 * The broker's digit count is not stored per position, and padding everything
 * to five decimals turns an index price into `38910.50000`. Two decimals is the
 * floor, and anything finer the stored value genuinely carries is kept.
 */
function priceOf(value: unknown) {
  const price = toNumber(value);
  const padded = price.toFixed(5).replace(/(\.\d{2}\d*?)0+$/, "$1");
  return padded;
}

export default async function AccountHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  // getAccount scopes to the owner, so another member's id is a 404 rather
  // than someone else's trading history.
  const account = await getAccount(id, user.id);
  if (!account) notFound();

  const [positions, summary] = await Promise.all([
    positionRepository.listForAccount(id),
    positionRepository.summaryForAccount(id),
  ]);

  const unsettled = summary.closedCount - summary.settledCount;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/account" className="text-sm text-muted hover:underline">
          ← Trading accounts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{account.label} — trade history</h1>
        <p className="mt-1 text-sm text-muted">
          {account.platform} · {account.broker} · {account.login} @ {account.server}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open" value={String(summary.openCount)} />
        <Stat label="Closed" value={String(summary.closedCount)} />
        <Stat
          label="Net profit"
          value={summary.settledCount === 0 ? "—" : formatCurrency(summary.netProfit, account.currency)}
          tone={summary.settledCount === 0 ? undefined : summary.netProfit >= 0 ? "up" : "down"}
          // A total that counted an unreported result as zero would read as a
          // flat trade rather than a missing one, so it is said out loud.
          note={unsettled > 0 ? `${unsettled} without a reported result` : undefined}
        />
        <Stat
          label="Win rate"
          value={summary.winRatePct === null ? "—" : `${summary.winRatePct}%`}
          note={summary.settledCount > 0 ? `of ${summary.settledCount} settled` : undefined}
        />
      </div>

      {positions.length === 0 ? (
        <EmptyState
          title="No positions on this account yet"
          description="Every position copied to this account appears here — what was opened, what it closed at, and what it made or lost."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Opened</Th>
              <Th>Strategy</Th>
              <Th>Symbol</Th>
              <Th>Type</Th>
              <Th className="text-right">Lot</Th>
              <Th className="text-right">Entry</Th>
              <Th className="text-right">Exit</Th>
              <Th className="text-right">Profit</Th>
              <Th>Closed</Th>
              <Th>Status</Th>
              <Th>Ticket</Th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const profit = position.profit === null ? null : toNumber(position.profit);

              return (
                <tr key={position.id}>
                  <Td className="whitespace-nowrap text-xs">{position.openedAt.toLocaleString()}</Td>
                  <Td>{position.subscription?.strategy.name ?? "—"}</Td>
                  <Td>{position.symbol}</Td>
                  <Td>
                    <span className={position.orderType === "BUY" ? "text-emerald-500" : "text-red-500"}>
                      {position.orderType}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatLot(toNumber(position.volume))}</Td>
                  <Td className="text-right tabular-nums">{priceOf(position.openPrice)}</Td>
                  <Td className="text-right tabular-nums">
                    {position.closePrice === null ? "—" : priceOf(position.closePrice)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {profit === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className={profit >= 0 ? "text-emerald-500" : "text-red-500"}>
                        {formatCurrency(profit, account.currency)}
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {position.closedAt ? (
                      <>
                        {position.closedAt.toLocaleString()}
                        {position.closeReason && (
                          <span className="block text-muted">{CLOSE_REASON_LABEL[position.closeReason]}</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={position.status} />
                  </Td>
                  <Td className="text-xs tabular-nums">
                    {position.memberTicket}
                    {/* MT4 issues a new ticket for the remainder of a partial
                        close, so one position can have several. */}
                    {position.ticketHistory.length > 0 && (
                      <span className="block text-muted">was {position.ticketHistory.join(", ")}</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "up" | "down";
}) {
  const colour = tone === "up" ? "text-emerald-500" : tone === "down" ? "text-red-500" : undefined;

  return (
    <div className="panel rounded-xl border p-4" style={{ borderColor: "var(--panel-border)" }}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${colour ?? ""}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
