import { Activity, Bot, Gauge, ShieldCheck } from "lucide-react";
import { CandlestickChart } from "./candlestick-chart";
import { getDictionary } from "@/lib/i18n/server";

/**
 * The hero's product visual: the live chart framed as an operations console.
 *
 * Every figure here is illustrative — the real dashboard renders the member's
 * own account and shows an empty state until one is connected.
 */

const feed = [
  { symbol: "XAUUSD", side: "BUY", lot: "0.05", state: "copied", ms: "138 ms" },
  { symbol: "EURUSD", side: "SELL", lot: "0.10", state: "copied", ms: "151 ms" },
  { symbol: "US30", side: "BUY", lot: "0.02", state: "copied", ms: "129 ms" },
  { symbol: "GBPJPY", side: "SELL", lot: "0.04", state: "routing", ms: "—" },
];

export async function AiConsole() {
  const t = await getDictionary();

  const metrics = [
    { icon: Gauge, label: t.console.latency, value: "142 ms", hint: t.console.latencyHint },
    { icon: Activity, label: t.console.signal, value: "87%", hint: t.console.signalHint },
    { icon: ShieldCheck, label: t.console.risk, value: t.console.riskValue, hint: t.console.riskHint },
  ];

  return (
    <div className="glass-panel hud-frame overflow-hidden rounded-2xl">
      {/* console chrome */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--panel-border)", background: "color-mix(in srgb, var(--bg-deep) 70%, transparent)" }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />

        <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-muted">
          <Bot className="h-3.5 w-3.5" style={{ color: "var(--ai-cyan)" }} />
          {t.console.title}
        </span>

        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: "color-mix(in srgb, var(--candle-up) 14%, transparent)", color: "var(--candle-up)" }}
        >
          <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
          {t.console.copying}
        </span>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.5fr_1fr]">
        <CandlestickChart labels={{ live: t.console.live, still: t.console.still, chartLabel: t.console.chartLabel }} />

        <div className="flex flex-col gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-xl px-3.5 py-3"
              style={{ background: "var(--bg)", border: "1px solid var(--panel-border)" }}
            >
              <div className="flex items-center gap-2">
                <m.icon className="h-3.5 w-3.5" style={{ color: "var(--gold)" }} />
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{m.label}</p>
                <p className="ml-auto text-sm font-semibold tabular-nums">{m.value}</p>
              </div>
              <p className="mt-1 text-[11px] text-muted">{m.hint}</p>
            </div>
          ))}

          <div
            className="flex-1 rounded-xl px-3.5 py-3"
            style={{ background: "var(--bg)", border: "1px solid var(--panel-border)" }}
          >
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{t.console.feed}</p>
            <ul className="mt-2.5 space-y-2.5">
              {feed.map((f) => {
                const buy = f.side === "BUY";
                const pending = f.state === "routing";
                return (
                  <li key={f.symbol} className="flex items-center gap-2 text-xs">
                    <span
                      className={pending ? "live-dot h-1.5 w-1.5 rounded-full" : "h-1.5 w-1.5 rounded-full"}
                      style={{ background: pending ? "var(--gold)" : "var(--candle-up)" }}
                    />
                    <span className="font-medium">{f.symbol}</span>
                    <span
                      className="font-medium"
                      style={{ color: buy ? "var(--candle-up)" : "var(--candle-down)" }}
                    >
                      {f.side}
                    </span>
                    <span className="text-muted tabular-nums">{f.lot}</span>
                    <span className="ml-auto text-muted tabular-nums">{f.ms}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
