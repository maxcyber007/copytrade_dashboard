import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getAccount } from "@/services/account.service";
import { getAccountTradeHistory } from "@/services/trade-history.service";
import { Table, Td, Th } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatLot, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

/** How a close is described to the member, rather than by the broker's code. */
const CLOSE_REASON_LABEL: Record<string, string> = {
  STOP_LOSS: "Stop loss",
  TAKE_PROFIT: "Take profit",
  COPIED_CLOSE: "Closed by strategy",
  MANUAL: "Closed manually",
  OTHER: "Closed at broker",
};

/**
 * Prices, at the precision the instrument actually uses.
 *
 * The broker's digit count is not stored per trade, and padding everything to
 * five decimals turns an index price into `38910.50000`. Two decimals is the
 * floor, and anything finer the value genuinely carries is kept.
 */
function priceOf(value: unknown) {
  return toNumber(value)
    .toFixed(5)
    .replace(/(\.\d{2}\d*?)0+$/, "$1");
}

export default async function AccountHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { id } = await params;
  const { days: daysParam } = await searchParams;
  const user = await requireUser();

  // getAccount scopes to the owner, so another member's id is a 404 rather
  // than someone else's trading history.
  const account = await getAccount(id, user.id);
  if (!account) notFound();

  const days = RANGES.includes(Number(daysParam) as (typeof RANGES)[number]) ? Number(daysParam) : 30;
  const history = await getAccountTradeHistory(id, user.id, { days });

  const settled = history.totals.wins + history.totals.losses;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/account" className="text-sm text-muted hover:underline">
          ← Trading accounts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{account.label} — trade history</h1>
        <p className="mt-1 text-sm text-muted">
          {account.platform} · {account.broker} · {account.login} @ {account.server} — every trade on this
          account, whether the platform copied it or you placed it yourself.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((range) => (
          <Link
            key={range}
            href={`/account/${id}/history?days=${range}`}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              range === days ? "border-[var(--gold-line)] text-gold" : "text-muted hover:text-gold"
            }`}
            style={range === days ? undefined : { borderColor: "var(--panel-border)" }}
          >
            Last {range} days
          </Link>
        ))}
      </div>

      {history.brokerUnavailable && (
        // Saying so beats a short history that looks complete.
        <div
          className="rounded-xl border px-4 py-3 text-sm text-muted"
          style={{ borderColor: "var(--panel-border)" }}
        >
          Showing only what the platform copied — {history.brokerUnavailable}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Trades" value={String(history.rows.length)} note={`over ${days} days`} />
        <Stat label="Closed volume" value={`${formatLot(history.totals.volume)} lots`} />
        <Stat
          label="Net profit"
          value={settled === 0 ? "—" : formatCurrency(history.totals.profit, account.currency)}
          tone={settled === 0 ? undefined : history.totals.profit >= 0 ? "up" : "down"}
        />
        <Stat
          label="Win rate"
          value={settled === 0 ? "—" : `${((history.totals.wins / settled) * 100).toFixed(1)}%`}
          note={settled === 0 ? undefined : `${history.totals.wins}W / ${history.totals.losses}L`}
        />
      </div>

      {history.rows.length === 0 ? (
        <EmptyState
          title="No trades in this period"
          description="Trades on this account appear here — copied and manual alike — with what each one opened at, closed at, and made or lost."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Closed</Th>
              <Th>Source</Th>
              <Th>Symbol</Th>
              <Th>Type</Th>
              <Th className="text-right">Lot</Th>
              <Th className="text-right">Entry</Th>
              <Th className="text-right">Exit</Th>
              <Th className="text-right">Profit</Th>
              <Th>Ticket</Th>
            </tr>
          </thead>
          <tbody>
            {history.rows.map((row) => (
              <tr key={row.ticket}>
                <Td className="whitespace-nowrap text-xs">
                  {row.closedAt ? (
                    <>
                      {row.closedAt.toLocaleString()}
                      {row.reason && (
                        <span className="block text-muted">{CLOSE_REASON_LABEL[row.reason] ?? row.reason}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-gold">Still open</span>
                  )}
                </Td>
                <Td className="text-xs">
                  {/* A member's own trade is not a platform failure — it is
                      simply theirs, and saying which is which matters. */}
                  {row.copied ? (
                    <>
                      <span className="text-gold">Copied</span>
                      {row.strategyName && <span className="block text-muted">{row.strategyName}</span>}
                    </>
                  ) : (
                    <span className="text-muted">Your own trade</span>
                  )}
                </Td>
                <Td>{row.symbol}</Td>
                <Td>
                  <span className={row.orderType === "BUY" ? "text-emerald-500" : "text-red-500"}>
                    {row.orderType}
                  </span>
                </Td>
                <Td className="text-right tabular-nums">{formatLot(row.volume)}</Td>
                <Td className="text-right tabular-nums">
                  {row.openPrice === undefined ? "—" : priceOf(row.openPrice)}
                </Td>
                <Td className="text-right tabular-nums">
                  {row.closePrice === undefined ? "—" : priceOf(row.closePrice)}
                </Td>
                <Td className="text-right tabular-nums">
                  {row.closedAt === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className={row.profit >= 0 ? "text-emerald-500" : "text-red-500"}>
                      {formatCurrency(row.profit, account.currency)}
                    </span>
                  )}
                </Td>
                <Td className="text-xs tabular-nums">{row.ticket}</Td>
              </tr>
            ))}
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
  const colour = tone === "up" ? "text-emerald-500" : tone === "down" ? "text-red-500" : "";

  return (
    <div className="panel rounded-xl border p-4" style={{ borderColor: "var(--panel-border)" }}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${colour}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
