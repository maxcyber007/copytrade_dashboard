"use client";

import { cn } from "@/lib/utils";

/**
 * Accessible on/off switch.
 *
 * Built on a real <button role="switch"> rather than a styled checkbox so the
 * state is announced correctly and it is operable from the keyboard without
 * extra handling. `busy` keeps it interactive-looking but blocked while the
 * change is in flight, since these toggles call out to a trading provider and
 * are not instant.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  busy = false,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
      style={{
        background: checked ? "var(--candle-up)" : "var(--panel-border)",
      }}
    >
      <span
        className={cn(
          "inline-block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-[3px]",
        )}
        style={{ height: 18, width: 18 }}
      >
        {busy && (
          <span className="block h-full w-full animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
        )}
      </span>
    </button>
  );
}
