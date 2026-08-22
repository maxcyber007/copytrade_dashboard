import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-slate-500/10 text-slate-500",
  success: "bg-emerald-500/10 text-emerald-500",
  warning: "bg-amber-500/10 text-amber-500",
  danger: "bg-red-500/10 text-red-500",
  info: "bg-brand-500/10 text-brand-500",
} as const;

export type Tone = keyof typeof TONES;

const STATUS_TONES: Record<string, Tone> = {
  CONNECTED: "success",
  COPYING: "success",
  ACTIVE: "success",
  SUCCESS: "success",
  PAUSED: "warning",
  RETRYING: "warning",
  PENDING: "warning",
  CONNECTING: "warning",
  ERROR: "danger",
  FAILED: "danger",
  DISCONNECTED: "neutral",
  IDLE: "neutral",
  STOPPED: "neutral",
  SKIPPED: "neutral",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", TONES[tone], className)}>
      {status}
    </span>
  );
}
