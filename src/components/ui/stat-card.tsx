import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "profit" | "loss" | "gold";
  className?: string;
}) {
  const valueStyle =
    tone === "profit"
      ? { color: "var(--color-profit, #16a34a)" }
      : tone === "loss"
        ? { color: "var(--color-loss, #dc2626)" }
        : tone === "gold"
          ? { color: "var(--gold)" }
          : undefined;

  return (
    <div className={cn("panel rounded-xl p-4", className)}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums" style={valueStyle}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
