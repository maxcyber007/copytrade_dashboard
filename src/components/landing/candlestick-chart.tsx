"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mulberry32 } from "@/lib/seeded-random";

/**
 * The animated market visual on the landing page.
 *
 * The opening series is generated from a fixed seed so the server-rendered
 * markup and the first client render are byte-identical — a random series here
 * would hydrate-mismatch on every load. Streaming only starts after mount.
 */

type Candle = { o: number; h: number; l: number; c: number; v: number };

const CANDLE_COUNT = 32;
const BASE_PRICE = 3345.2;
const TICK_MS = 780;
const TICKS_PER_CANDLE = 6;
const FORECAST_STEPS = 6;

function buildSeries(seed: number, count: number, start: number): Candle[] {
  const rng = mulberry32(seed);
  const out: Candle[] = [];
  let price = start;

  for (let i = 0; i < count; i++) {
    // A gentle upward bias keeps the illustration readable without looking flat.
    const drift = (rng() - 0.44) * 5.2;
    const o = price;
    const c = o + drift;
    const wick = 0.6 + rng() * 2.4;
    out.push({
      o,
      c,
      h: Math.max(o, c) + wick,
      l: Math.min(o, c) - wick,
      v: 0.28 + rng() * 0.72,
    });
    price = c;
  }
  return out;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    const v = i === 0 ? prev : values[i]! * k + prev * (1 - k);
    out.push(v);
    prev = v;
  }
  return out;
}

export function CandlestickChart({
  labels,
}: {
  labels: { live: string; still: string; chartLabel: string };
}) {
  const seeded = useMemo(() => buildSeries(20260824, CANDLE_COUNT, BASE_PRICE), []);
  const [candles, setCandles] = useState<Candle[]>(seeded);
  const [streaming, setStreaming] = useState(false);

  const rngRef = useRef(mulberry32(918273));
  const tickRef = useRef(0);

  useEffect(() => {
    // Honour the OS setting rather than leaving it to CSS alone: with reduced
    // motion the series simply stays still.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    setStreaming(true);
    const rng = rngRef.current;

    const id = window.setInterval(() => {
      tickRef.current += 1;
      const commit = tickRef.current % TICKS_PER_CANDLE === 0;

      setCandles((prev) => {
        const next = prev.slice();
        const i = next.length - 1;
        const last = { ...next[i]! };

        const step = (rng() - 0.47) * 3.6;
        last.c = last.c + step;
        last.h = Math.max(last.h, last.c + rng() * 0.5);
        last.l = Math.min(last.l, last.c - rng() * 0.5);
        last.v = Math.min(1, last.v + rng() * 0.06);
        next[i] = last;

        if (!commit) return next;

        // Close this candle and open the next one, keeping the window fixed.
        next.shift();
        next.push({
          o: last.c,
          c: last.c,
          h: last.c + rng() * 0.8,
          l: last.c - rng() * 0.8,
          v: 0.24 + rng() * 0.5,
        });
        return next;
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, []);

  // --- geometry -----------------------------------------------------------
  const W = 720;
  const H = 300;
  const padL = 12;
  const padR = 86;
  const padT = 18;
  const padB = 76;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const volTop = padT + plotH + 14;
  const volH = H - volTop - 14;

  const closes = candles.map((c) => c.c);
  const line = ema(closes, 8);

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const rawMax = Math.max(...highs);
  const rawMin = Math.min(...lows);
  const span = Math.max(rawMax - rawMin, 1);
  const max = rawMax + span * 0.12;
  const min = rawMin - span * 0.12;

  const slot = plotW / candles.length;
  const bodyW = Math.max(3, slot * 0.56);
  const x = (i: number) => padL + (i + 0.5) * slot;
  const y = (p: number) => padT + ((max - p) / (max - min)) * plotH;

  const last = candles[candles.length - 1]!;
  const first = candles[0]!;
  const rising = last.c >= first.o;
  const changePct = ((last.c - first.o) / first.o) * 100;

  const emaPath = line
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  // Forward projection: extend the trend slope and widen a band around it.
  const slope = (line[line.length - 1]! - line[line.length - 4]!) / 3;
  const projection = Array.from({ length: FORECAST_STEPS }, (_, k) => {
    const px = x(candles.length - 1) + slot * (k + 1);
    const pv = last.c + slope * (k + 1) * 1.15;
    const spread = span * 0.05 * (k + 1);
    return { px, pv, spread };
  });

  const projPath = [`M${x(candles.length - 1).toFixed(1)},${y(last.c).toFixed(1)}`]
    .concat(projection.map((p) => `L${p.px.toFixed(1)},${y(p.pv).toFixed(1)}`))
    .join(" ");

  const bandPath = [
    `M${x(candles.length - 1).toFixed(1)},${y(last.c).toFixed(1)}`,
    ...projection.map((p) => `L${p.px.toFixed(1)},${y(p.pv + p.spread).toFixed(1)}`),
    ...projection
      .slice()
      .reverse()
      .map((p) => `L${p.px.toFixed(1)},${y(p.pv - p.spread).toFixed(1)}`),
    "Z",
  ].join(" ");

  const gridPrices = Array.from({ length: 4 }, (_, i) => min + ((max - min) / 3) * i);
  const maxVol = Math.max(...candles.map((c) => c.v), 0.01);

  return (
    <div className="relative">
      {/* readouts above the chart */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">XAUUSD</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted">M5</span>
        </div>

        <div className="flex items-baseline gap-2">
          <span
            className="text-lg font-semibold tabular-nums"
            style={{ color: rising ? "var(--candle-up)" : "var(--candle-down)" }}
          >
            {last.c.toFixed(2)}
          </span>
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: rising ? "var(--candle-up)" : "var(--candle-down)" }}
          >
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </span>
        </div>

        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]"
          style={{ border: "1px solid var(--gold-line)", color: "var(--gold)" }}
        >
          <span
            className={streaming ? "live-dot h-1.5 w-1.5 rounded-full" : "h-1.5 w-1.5 rounded-full"}
            style={{ background: "currentColor" }}
          />
          {streaming ? labels.live : labels.still}
        </span>
      </div>

      <div className="hud-frame relative overflow-hidden rounded-xl" style={{ background: "var(--bg)" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label={labels.chartLabel}
        >
          <defs>
            <linearGradient id="ct-vol" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="ct-band" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--ai-cyan)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--ai-cyan)" stopOpacity="0.03" />
            </linearGradient>
            <filter id="ct-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* price grid */}
          {gridPrices.map((p) => (
            <g key={p}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={y(p)}
                y2={y(p)}
                stroke="var(--chart-grid)"
                strokeWidth="1"
                strokeDasharray="3 6"
              />
              <text
                x={padL + plotW + 10}
                y={y(p) + 3.5}
                fontSize="10"
                fill="var(--text-muted)"
                className="tabular-nums"
              >
                {p.toFixed(1)}
              </text>
            </g>
          ))}

          {/* projected path + confidence band */}
          <path d={bandPath} fill="url(#ct-band)" />
          <path
            d={projPath}
            fill="none"
            stroke="var(--ai-cyan)"
            strokeWidth="1.6"
            strokeDasharray="5 5"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* volume */}
          {candles.map((c, i) => {
            const h = Math.max(1.5, (c.v / maxVol) * volH);
            return (
              <rect
                key={`v${i}`}
                x={x(i) - bodyW / 2}
                y={volTop + volH - h}
                width={bodyW}
                height={h}
                fill="url(#ct-vol)"
                rx="1"
              />
            );
          })}

          {/* candles */}
          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const colour = up ? "var(--candle-up)" : "var(--candle-down)";
            const top = y(Math.max(c.o, c.c));
            const bottom = y(Math.min(c.o, c.c));
            const height = Math.max(1.5, bottom - top);
            const isLast = i === candles.length - 1;
            return (
              <g key={i} className="candle-in" style={{ animationDelay: `${Math.min(i * 26, 700)}ms` }}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(c.h)}
                  y2={y(c.l)}
                  stroke={colour}
                  strokeWidth="1.2"
                  opacity={isLast ? 1 : 0.75}
                />
                <rect
                  x={x(i) - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={height}
                  fill={colour}
                  opacity={isLast ? 1 : 0.82}
                  rx="1.5"
                  filter={isLast ? "url(#ct-glow)" : undefined}
                />
              </g>
            );
          })}

          {/* trend line */}
          <path
            d={emaPath}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.95"
            filter="url(#ct-glow)"
          />

          {/* live price marker */}
          <line
            x1={padL}
            x2={padL + plotW}
            y1={y(last.c)}
            y2={y(last.c)}
            stroke={rising ? "var(--candle-up)" : "var(--candle-down)"}
            strokeWidth="1"
            strokeDasharray="2 4"
            opacity="0.55"
          />
          <g transform={`translate(${padL + plotW + 4}, ${y(last.c) - 9})`}>
            <rect width="66" height="18" rx="4" fill={rising ? "var(--candle-up)" : "var(--candle-down)"} />
            <text
              x="33"
              y="12.5"
              fontSize="10.5"
              fontWeight="600"
              fill="#fff"
              textAnchor="middle"
              className="tabular-nums"
            >
              {last.c.toFixed(2)}
            </text>
          </g>
        </svg>

        {/* sweeping scan overlay */}
        <div className="scan-beam" aria-hidden="true" />
      </div>
    </div>
  );
}
