/**
 * The neural-network graphic on the auth screen.
 *
 * Pure SVG with CSS-driven motion and fixed node coordinates, so it needs no
 * client JavaScript and cannot hydrate-mismatch. Animation delays are derived
 * from indices rather than randomised for the same reason.
 */

const LAYERS: { x: number; ys: number[] }[] = [
  { x: 62, ys: [72, 132, 192, 252] },
  { x: 200, ys: [52, 107, 162, 217, 272] },
  { x: 338, ys: [107, 162, 217] },
];

const EDGES: { x1: number; y1: number; x2: number; y2: number; i: number }[] = [];
for (let l = 0; l < LAYERS.length - 1; l++) {
  const from = LAYERS[l]!;
  const to = LAYERS[l + 1]!;
  from.ys.forEach((y1, a) => {
    to.ys.forEach((y2, b) => {
      EDGES.push({ x1: from.x, y1, x2: to.x, y2, i: EDGES.length + a + b });
    });
  });
}

export function AuthVisual({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 324" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="av-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </radialGradient>
        <filter id="av-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* ambient wash behind the graph */}
      <circle cx="200" cy="162" r="150" fill="url(#av-glow)" />

      {/* radar rings sweeping outward from the centre */}
      {[0, 1, 2].map((r) => (
        <circle
          key={r}
          className="radar-ring"
          cx="200"
          cy="162"
          r="140"
          fill="none"
          stroke="var(--ai-cyan)"
          strokeWidth="1"
          opacity="0"
          style={{ animationDelay: `${r * 1.5}s` }}
        />
      ))}

      {/* connections, with a signal running along each */}
      <g stroke="var(--gold-line)" strokeWidth="1">
        {EDGES.map((e, index) => (
          <line key={index} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} opacity="0.55" />
        ))}
      </g>
      <g stroke="var(--ai-cyan)" strokeWidth="1.6" strokeLinecap="round">
        {EDGES.map((e, index) => (
          <line
            key={index}
            className="neural-edge"
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            opacity="0.9"
            style={{ animationDelay: `${(e.i % 12) * 0.22}s` }}
          />
        ))}
      </g>

      {/* nodes */}
      {LAYERS.map((layer, l) =>
        layer.ys.map((y, n) => (
          <g key={`${l}-${n}`}>
            <circle
              cx={layer.x}
              cy={y}
              r="9"
              fill="var(--gold)"
              opacity="0.18"
              filter="url(#av-blur)"
            />
            <circle
              className="neural-node"
              cx={layer.x}
              cy={y}
              r="4.5"
              fill={l === 1 ? "var(--ai-cyan)" : "var(--gold)"}
              style={{ animationDelay: `${(l * 3 + n) * 0.28}s` }}
            />
          </g>
        )),
      )}
    </svg>
  );
}
