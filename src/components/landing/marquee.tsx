const ITEMS = [
  "MetaTrader 4",
  "MetaTrader 5",
  "Hedging accounts",
  "Netting accounts",
  "Forex",
  "Metals",
  "Indices",
  "Broker symbol mapping",
  "Fixed lot",
  "Multiplier",
  "Balance ratio",
  "Risk percent",
];

/** Capability strip. Every item is something the platform actually supports. */
export function Marquee() {
  return (
    <div className="relative overflow-hidden border-y py-4" style={{ borderColor: "var(--panel-border)" }}>
      <div className="flex w-max animate-marquee gap-10">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center gap-10" aria-hidden={copy === 1}>
            {ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-3 whitespace-nowrap text-sm text-muted">
                <span className="h-1 w-1 rounded-full" style={{ background: "var(--gold)" }} />
                {item}
              </li>
            ))}
          </ul>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-24"
        style={{ background: "linear-gradient(90deg, var(--bg), transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-24"
        style={{ background: "linear-gradient(270deg, var(--bg), transparent)" }}
      />
    </div>
  );
}
