"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";

type Decision = "APPROVE" | "REJECT" | "SUSPEND";

export function ProviderReviewActions({ providerId, status }: { providerId: string; status: ProviderStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: Decision) {
    setError(null);

    // A rejection or suspension must carry a reason the applicant can read.
    let publicReason: string | undefined;
    if (decision !== "APPROVE") {
      const entered = window.prompt(
        decision === "REJECT" ? "Reason shown to the applicant:" : "Reason for suspending this provider:",
      );
      if (!entered) return;
      publicReason = entered;
    }

    setPending(decision);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, publicReason }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? "Review failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status !== "APPROVED" && (
          <Button size="sm" loading={pending === "APPROVE"} onClick={() => review("APPROVE")}>
            Approve
          </Button>
        )}
        {status === "PENDING" && (
          <Button size="sm" variant="secondary" loading={pending === "REJECT"} onClick={() => review("REJECT")}>
            Reject
          </Button>
        )}
        {status === "APPROVED" && (
          <Button size="sm" variant="danger" loading={pending === "SUSPEND"} onClick={() => review("SUSPEND")}>
            Suspend
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
