/**
 * Illustrative product preview. The figures are placeholders shown to explain
 * the layout — the real dashboard renders live account data, and shows an empty
 * state until an account is connected.
 */
export function DashboardPreview() {
  const stats = [
    { label: "Balance", value: "$10,250.00" },
    { label: "Equity", value: "$10,430.00" },
    { label: "Today P/L", value: "+$180.00", tone: "profit" as const },
    { label: "Drawdown", value: "3.2%" },
  ];

  const positions = [
    { symbol: "XAUUSD", side: "BUY", lot: "0.05", open: "3,345.20", now: "3,351.40", pnl: "+$31.00", up: true },
    { symbol: "EURUSD", side: "SELL", lot: "0.10", open: "1.0842", now: "1.0836", pnl: "+$6.00", up: true },
    { symbol: "US30", side: "BUY", lot: "0.02", open: "38,940", now: "38,912", pnl: "-$5.60", up: false },
  ];

  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-2xl shadow-2xl"
        style={{ border: "1px solid var(--gold-line)", background: "var(--panel)" }}
      >
        {/* window chrome */}
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: "var(--panel-border)", background: "var(--bg-deep)" }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
          <span className="ml-3 text-xs text-muted">Member dashboard — illustrative example</span>
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a" }}
          >
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: "#16a34a" }} />
            COPYING
          </span>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl p-3" style={{ background: "var(--bg)" }}>
                  <p className="text-[11px] uppercase tracking-wide text-muted">{s.label}</p>
                  <p
                    className="mt-1 text-sm font-semibold tabular-nums sm:text-base"
                    style={s.tone === "profit" ? { color: "#16a34a" } : undefined}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl p-4" style={{ background: "var(--bg)" }}>
              <p className="text-[11px] uppercase tracking-wide text-muted">Equity curve</p>
              <svg viewBox="0 0 400 110" className="mt-2 h-28 w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,88 L40,80 L80,84 L120,66 L160,72 L200,52 L240,58 L280,38 L320,44 L360,24 L400,18 L400,110 L0,110 Z"
                  fill="url(#curve-fill)"
                />
                <path
                  className="animate-draw"
                  d="M0,88 L40,80 L80,84 L120,66 L160,72 L200,52 L240,58 L280,38 L320,44 L360,24 L400,18"
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: "var(--bg)" }}>
            <p className="text-[11px] uppercase tracking-wide text-muted">Open positions</p>
            <ul className="mt-3 space-y-3">
              {positions.map((p) => (
                <li key={p.symbol} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {p.symbol}{" "}
                      <span className="text-xs" style={{ color: p.side === "BUY" ? "#16a34a" : "#dc2626" }}>
                        {p.side}
                      </span>
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      {p.lot} lot · {p.open} → {p.now}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: p.up ? "#16a34a" : "#dc2626" }}>
                    {p.pnl}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
