import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Table, Td, Th } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatLot, toNumber } from "@/lib/utils";
import { Pagination, paginate, parsePage, parsePageSize } from "@/components/ui/pagination";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

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
  searchParams: Promise<{ days?: string; size?: string; page?: string }>;
}) {
  const { id } = await params;
  const { days: daysParam, size: sizeParam, page: pageParam } = await searchParams;
  await requireUser();
  const t = await getDictionary();

  /** How a close is described to the member, rather than by the broker's code. */
  const closeReasonLabel: Record<string, string> = {
    STOP_LOSS: t.tradeHistory.reasonStopLoss,
    TAKE_PROFIT: t.tradeHistory.reasonTakeProfit,
    COPIED_CLOSE: t.tradeHistory.reasonCopiedClose,
    MANUAL: t.tradeHistory.reasonManual,
    OTHER: t.tradeHistory.reasonOther,
  };

  // The loader scopes the account to its owner, so another member's id comes
  // back empty here and becomes a 404 — never someone else's trading history.
  const { account, history, days } = await loadPageData("account-history", { id, days: daysParam });
  if (!account || !history) notFound();

  const settled = history.totals.wins + history.totals.losses;

  const size = parsePageSize(sizeParam);
  const page = parsePage(pageParam, history.rows.length, size);
  const rows = paginate(history.rows, page, size);

  // Every filter belongs in the URL, so a page or size change keeps the rest.
  const hrefFor = (next: { days?: number; page?: number; size?: number }) => {
    const query = new URLSearchParams({
      days: String(next.days ?? days),
      size: String(next.size ?? size),
      page: String(next.page ?? page),
    });
    return `/account/${id}/history?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/account" className="text-sm text-muted hover:underline">
          {t.tradeHistory.back}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t.tradeHistory.title.replace("{label}", account.label)}</h1>
        <p className="mt-1 text-sm text-muted">
          {account.platform} · {account.broker} · {account.login} @ {account.server}{" "}
          {t.tradeHistory.subtitle}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((range) => (
          <Link
            key={range}
            // A different window is a different set of trades, so the reader
            // starts at its first page rather than page 4 of something else.
            href={hrefFor({ days: range, page: 1 })}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              range === days ? "border-[var(--gold-line)] text-gold" : "text-muted hover:text-gold"
            }`}
            style={range === days ? undefined : { borderColor: "var(--panel-border)" }}
          >
            {t.tradeHistory.lastDays.replace("{days}", String(range))}
          </Link>
        ))}
      </div>

      {history.brokerUnavailable && (
        // Saying so beats a short history that looks complete.
        <div
          className="rounded-xl border px-4 py-3 text-sm text-muted"
          style={{ borderColor: "var(--panel-border)" }}
        >
          {t.tradeHistory.brokerUnavailable} {history.brokerUnavailable}
        </div>
      )}

      {history.synchronizing && (
        // An empty list while the broker is still loading history would
        // otherwise read as "you have never traded".
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gold-line)" }}
        >
          {t.tradeHistory.synchronizing}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t.tradeHistory.trades}
          value={String(history.rows.length)}
          note={t.tradeHistory.overDays.replace("{days}", String(days))} />
        <Stat label={t.tradeHistory.closedVolume}
          value={`${formatLot(history.totals.volume)} ${t.tradeHistory.lots}`} />
        <Stat
          label={t.tradeHistory.netProfit}
          value={settled === 0 ? "—" : formatCurrency(history.totals.profit, account.currency)}
          tone={settled === 0 ? undefined : history.totals.profit >= 0 ? "up" : "down"}
        />
        <Stat
          label={t.tradeHistory.winRate}
          value={settled === 0 ? "—" : `${((history.totals.wins / settled) * 100).toFixed(1)}%`}
          note={
            settled === 0
              ? undefined
              : t.tradeHistory.winLoss
                  .replace("{wins}", String(history.totals.wins))
                  .replace("{losses}", String(history.totals.losses))
          }
        />
      </div>

      {history.rows.length === 0 ? (
        <EmptyState
          title={t.tradeHistory.emptyTitle}
          description={t.tradeHistory.emptyBody}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.tradeHistory.thClosed}</Th>
              <Th>{t.tradeHistory.thSource}</Th>
              <Th>{t.tradeHistory.thSymbol}</Th>
              <Th>{t.tradeHistory.thType}</Th>
              <Th className="text-right">{t.tradeHistory.thLot}</Th>
              <Th className="text-right">{t.tradeHistory.thEntry}</Th>
              <Th className="text-right">{t.tradeHistory.thExit}</Th>
              <Th className="text-right">{t.tradeHistory.thProfit}</Th>
              <Th>{t.tradeHistory.thTicket}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticket}>
                <Td className="whitespace-nowrap text-xs">
                  {row.closedAt ? (
                    <>
                      {row.closedAt.toLocaleString()}
                      {row.reason && (
                        <span className="block text-muted">{closeReasonLabel[row.reason] ?? row.reason}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-gold">{t.tradeHistory.stillOpen}</span>
                  )}
                </Td>
                <Td className="text-xs">
                  {/* A member's own trade is not a platform failure — it is
                      simply theirs, and saying which is which matters. */}
                  {row.copied ? (
                    <>
                      <span className="text-gold">{t.tradeHistory.copied}</span>
                      {row.strategyName && <span className="block text-muted">{row.strategyName}</span>}
                    </>
                  ) : (
                    <span className="text-muted">{t.tradeHistory.ownTrade}</span>
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

      {history.rows.length > 0 && (
        <Pagination
          total={history.rows.length}
          page={page}
          size={size}
          hrefFor={({ page: nextPage, size: nextSize }) => hrefFor({ page: nextPage, size: nextSize })}
        />
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
