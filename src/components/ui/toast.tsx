"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function Toast({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: "info" | "success" | "error";
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "panel fixed bottom-5 right-5 z-50 max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg",
        tone === "error" && "border-red-500/40",
        tone === "success" && "border-emerald-500/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex-1">{message}</span>
        <button type="button" onClick={onDismiss} className="text-muted transition hover:opacity-70" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
