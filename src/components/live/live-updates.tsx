"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/toast";

type LiveEvent = {
  type: "COPY_TRADE" | "ACCOUNT_UPDATED" | "COPY_STATUS" | "RISK_BREACH" | "PING";
  status?: string;
  symbol?: string;
  volume?: number;
  strategy?: string;
  reason?: string;
  at: string;
};

/**
 * Subscribes to the member's event stream and refreshes the server components
 * on the page when something changes.
 *
 * Refreshes are debounced: a master closing ten positions produces a burst, and
 * re-rendering once is both cheaper and less jarring than ten times.
 */
export function LiveUpdates({ showToasts = true }: { showToasts?: boolean }) {
  const router = useRouter();
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [connected, setConnected] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/stream");

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 600);
    };

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource reconnects by itself

    source.onmessage = (message) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }

      if (event.type === "PING") {
        setConnected(true);
        return;
      }

      scheduleRefresh();

      if (!showToasts) return;

      if (event.type === "COPY_TRADE") {
        const succeeded = event.status === "SUCCESS";
        setToast({
          message: succeeded
            ? `Copied ${event.volume} ${event.symbol} from ${event.strategy}`
            : `${event.symbol} not copied: ${event.status?.toLowerCase()}`,
          tone: succeeded ? "success" : "error",
        });
      } else if (event.type === "RISK_BREACH") {
        setToast({ message: event.reason ?? "A risk limit paused copying", tone: "error" });
      }
    };

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      source.close();
    };
  }, [router, showToasts]);

  return (
    <>
      <span className="inline-flex items-center gap-2 text-xs text-muted" title={connected ? "Live updates connected" : "Reconnecting…"}>
        <span
          className={connected ? "animate-pulse-dot h-1.5 w-1.5 rounded-full" : "h-1.5 w-1.5 rounded-full"}
          style={{ background: connected ? "#16a34a" : "var(--text-muted)" }}
        />
        {connected ? "Live" : "Reconnecting"}
      </span>
      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}
