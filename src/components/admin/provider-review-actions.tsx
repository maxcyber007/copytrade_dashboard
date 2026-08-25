"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderStatus } from "@prisma/client";
import { Ban, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

type Decision = "APPROVE" | "REJECT" | "SUSPEND";

export function ProviderReviewActions({ providerId, status }: { providerId: string; status: ProviderStatus }) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: Decision) {
    setError(null);

    // A rejection or suspension must carry a reason the applicant can read.
    let publicReason: string | undefined;
    if (decision !== "APPROVE") {
      const entered = window.prompt(
        decision === "REJECT" ? t.providerStatus.rejectPrompt : t.providerStatus.suspendPrompt,
      );
      if (!entered) return;
      publicReason = entered;
    }

    setPending(decision);
    try {
      const res = await apiFetch(`/api/admin/providers/${providerId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, publicReason }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? t.providerStatus.reviewFailed);
        return;
      }
      router.refresh();
    } catch {
      setError(t.common.networkError);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status !== "APPROVED" && (
          <Button size="sm" loading={pending === "APPROVE"} onClick={() => review("APPROVE")}>
            <Check className="h-4 w-4" />
            {t.providerStatus.approve}
          </Button>
        )}
        {status === "PENDING" && (
          <Button size="sm" variant="secondary" loading={pending === "REJECT"} onClick={() => review("REJECT")}>
            <X className="h-4 w-4" />
            {t.providerStatus.reject}
          </Button>
        )}
        {status === "APPROVED" && (
          <Button size="sm" variant="danger" loading={pending === "SUSPEND"} onClick={() => review("SUSPEND")}>
            <Ban className="h-4 w-4" />
            {t.providerStatus.suspend}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
