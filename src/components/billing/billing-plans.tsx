"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import type { PlanView } from "@/services/subscription.service";

export function BillingPlans({ plans, canCancel }: { plans: PlanView[]; canCancel: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  async function choose(plan: PlanView) {
    setBusy(plan.id);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { status: string; redirectUrl: string | null };
        error?: { message: string };
      };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Could not change plan");

      // A real gateway sends the member away to pay; the mock settles at once.
      if (json.data?.redirectUrl) {
        window.location.href = json.data.redirectUrl;
        return;
      }

      setToast({ message: `You are now on the ${plan.name} plan`, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel at the end of the current period? Access continues until then.")) return;
    setBusy("cancel");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Could not cancel");
      setToast({ message: "Your plan will end at the close of this period", tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Request failed", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="panel flex flex-col rounded-xl p-5"
            style={plan.current ? { borderColor: "var(--gold-line)", boxShadow: "0 0 0 1px var(--gold-line)" } : undefined}
          >
            {plan.current && (
              <span
                className="mb-2 inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--gold-glow)", color: "var(--gold)" }}
              >
                Current
              </span>
            )}
            <h3 className="text-base font-semibold">{plan.name}</h3>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">
                {plan.priceMonthly === 0 ? "Free" : `$${plan.priceMonthly}`}
              </span>
              {plan.priceMonthly > 0 && <span className="text-sm text-muted">/mo</span>}
            </p>

            <ul className="mt-4 flex-1 space-y-2 text-sm">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                <span className="text-muted">
                  {plan.maxAccounts} trading {plan.maxAccounts === 1 ? "account" : "accounts"}
                </span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                <span className="text-muted">
                  {plan.maxStrategies} {plan.maxStrategies === 1 ? "strategy" : "strategies"}
                </span>
              </li>
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                  <span className="text-muted">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              className="mt-5"
              size="sm"
              variant={plan.current ? "secondary" : "primary"}
              disabled={plan.current}
              loading={busy === plan.id}
              onClick={() => choose(plan)}
            >
              {plan.current ? "Current plan" : plan.priceMonthly === 0 ? "Switch to Free" : "Choose plan"}
            </Button>
          </article>
        ))}
      </div>

      <p className="text-xs text-muted">
        Payments run through a provider interface. The development provider settles immediately and
        collects no card details — no real charge is made.
      </p>

      {canCancel && (
        <Button variant="ghost" size="sm" loading={busy === "cancel"} onClick={cancel}>
          Cancel at period end
        </Button>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}
