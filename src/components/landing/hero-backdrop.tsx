"use client";

import { useEffect, useRef, useState } from "react";
import { mulberry32 } from "@/lib/seeded-random";

/**
 * The chart behind the hero copy.
 *
 * The chart body never moves. It draws itself in from the left: one candle at a
 * time, each forming in place before the next one opens to its right. Nothing
 * is rendered ahead of the newest candle, so the right side stays empty until
 * the sweep reaches it. Once the row is full it starts over from the left.
 *
 * Price comes from two slow sines of unrelated periods plus a little noise,
 * not from a random walk. A walk clusters around its mean — it used about a
 * quarter of the available height and read as a flat line through the middle.
 * Summed waves swing through roughly 80% of the height every row while staying
 * inside a known bound, so the vertical scale can stay fixed and nothing ever
 * clips. The two periods do not divide each other, so the shape does not
 * visibly repeat.
 *
 * There is deliberately no trend line or area fill — with the chart clearing
 * and refilling, a connecting path only draws attention to the restart.
 */

const TOTAL = 40; // candles in a full row
const TILE_W = 1200;
const TILE_H = 360;
const SLOT = TILE_W / TOTAL;
const BODY = SLOT * 0.5;
const MID = TILE_H / 2;
const BAND = 150;
const SCALE = (TILE_H * 0.44) / BAND; // leaves ~15px of headroom for wicks

const CANDLE_MS = 900; // how long one candle takes to form
const PRICE_MS = 120; // how often the forming candle re-prices

const SWING_SLOW = 0.65 * BAND; // main rise and fall
const SWING_FAST = 0.33 * BAND; // secondary ripple
const PERIOD_SLOW = 23; // candles
const PERIOD_FAST = 9.3; // candles — deliberately not a divisor of PERIOD_SLOW
const NOISE_DECAY = 0.85;
const NOISE_SHOCK = 0.06 * BAND;
const APPROACH = 0.3; // how fast the forming candle moves toward its close
const JITTER = 0.02 * BAND;

type Candle = { o: number; h: number; l: number; c: number };

const toX = (i: number) => i * SLOT + SLOT / 2;
const toY = (p: number) => MID - p * SCALE;

/** Where candle n is headed, before noise. */
function wave(n: number) {
  return (
    SWING_SLOW * Math.sin((2 * Math.PI * n) / PERIOD_SLOW + 0.7) +
    SWING_FAST * Math.sin((2 * Math.PI * n) / PERIOD_FAST + 2.4)
  );
}

function openCandle(price: number): Candle {
  return { o: price, c: price, h: price, l: price };
}

/** Full row, used as the still fallback when the visitor prefers reduced motion. */
function buildFullRow(seed: number): Candle[] {
  const rng = mulberry32(seed);
  const out: Candle[] = [];
  let noise = 0;
  let price = wave(0);

  for (let i = 0; i < TOTAL; i++) {
    noise = noise * NOISE_DECAY + (rng() - 0.5) * NOISE_SHOCK;
    const o = price;
    const c = wave(i + 1) + noise;
    out.push({ o, c, h: Math.max(o, c) + rng() * 9, l: Math.min(o, c) - rng() * 9 });
    price = c;
  }
  return out;
}

export function HeroBackdrop() {
  // Starts with just the first candle so the server-rendered markup already
  // matches the "empty on the right" look, with nothing to clear on hydration.
  const [candles, setCandles] = useState<Candle[]>(() => [openCandle(wave(0))]);

  const rngRef = useRef(mulberry32(561234));
  const indexRef = useRef(0); // absolute candle number, keeps the wave continuous across rows
  const noiseRef = useRef(0);
  const targetRef = useRef(wave(1));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCandles(buildFullRow(73109));
      return;
    }

    const rng = rngRef.current;

    // Walk the newest candle toward the close it is heading for.
    const priceId = window.setInterval(() => {
      setCandles((prev) => {
        const next = prev.slice();
        const i = next.length - 1;
        const c = { ...next[i]! };
        c.c += (targetRef.current - c.c) * APPROACH + (rng() - 0.5) * JITTER;
        c.h = Math.max(c.h, c.c + rng() * 2.5);
        c.l = Math.min(c.l, c.c - rng() * 2.5);
        next[i] = c;
        return next;
      });
    }, PRICE_MS);

    // Close it and open the next one to its right; start a new row once full.
    const commitId = window.setInterval(() => {
      indexRef.current += 1;
      noiseRef.current = noiseRef.current * NOISE_DECAY + (rng() - 0.5) * NOISE_SHOCK;
      targetRef.current = wave(indexRef.current + 1) + noiseRef.current;

      setCandles((prev) => {
        const open = prev[prev.length - 1]!.c;
        if (prev.length >= TOTAL) return [openCandle(open)];
        return [...prev, openCandle(open)];
      });
    }, CANDLE_MS);

    return () => {
      window.clearInterval(priceId);
      window.clearInterval(commitId);
    };
  }, []);

  return (
    <div className="hero-chart" aria-hidden="true">
      <svg viewBox={`0 0 ${TILE_W} ${TILE_H}`} preserveAspectRatio="none" focusable="false">
        {candles.map((c, i) => {
          const up = c.c >= c.o;
          const colour = up ? "var(--candle-up)" : "var(--candle-down)";
          const top = toY(Math.max(c.o, c.c));
          const bottom = toY(Math.min(c.o, c.c));
          const x = toX(i);
          const forming = i === candles.length - 1;
          return (
            <g key={i} fill={colour} stroke={colour}>
              <line
                x1={x}
                x2={x}
                y1={toY(c.h)}
                y2={toY(c.l)}
                strokeWidth="1.6"
                opacity={forming ? 0.95 : 0.6}
              />
              <rect
                x={x - BODY / 2}
                y={top}
                width={BODY}
                height={Math.max(2, bottom - top)}
                rx="1.5"
                opacity={forming ? 1 : 0.8}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
