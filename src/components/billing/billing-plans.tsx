"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarX, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import type { PlanView } from "@/services/subscription.service";
import { useT } from "@/components/i18n/locale-provider";
import { plural } from "@/lib/i18n/format";
import { apiFetch } from "@/lib/api-client/browser";

export function BillingPlans({ plans, canCancel }: { plans: PlanView[]; canCancel: boolean }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  async function choose(plan: PlanView) {
    setBusy(plan.id);
    try {
      const res = await apiFetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { status: string; redirectUrl: string | null };
        error?: { message: string };
      };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? t.billing.couldNotChange);

      // A real gateway sends the member away to pay; the mock settles at once.
      if (json.data?.redirectUrl) {
        window.location.href = json.data.redirectUrl;
        return;
      }

      setToast({ message: t.billing.nowOnPlan.replace("{name}", plan.name), tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : t.billing.requestFailed, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!window.confirm(t.billing.cancelConfirm)) return;
    setBusy("cancel");
    try {
      const res = await apiFetch("/api/billing/cancel", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? t.billing.couldNotCancel);
      setToast({ message: t.billing.willEnd, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : t.billing.requestFailed, tone: "error" });
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
                {t.billing.current}
              </span>
            )}
            <h3 className="text-base font-semibold">{plan.name}</h3>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">
                {plan.priceMonthly === 0 ? t.common.free : `$${plan.priceMonthly}`}
              </span>
              {plan.priceMonthly > 0 && <span className="text-sm text-muted">{t.billing.perMonth}</span>}
            </p>

            <ul className="mt-4 flex-1 space-y-2 text-sm">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                <span className="text-muted">
                  {plural(t.billing.accounts, plan.maxAccounts)}
                </span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold)" }} />
                <span className="text-muted">
                  {plural(t.billing.strategies, plan.maxStrategies)}
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
              {plan.current ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              {plan.current
                ? t.billing.currentPlan
                : plan.priceMonthly === 0
                  ? t.billing.switchToFree
                  : t.billing.choosePlan}
            </Button>
          </article>
        ))}
      </div>

      <p className="text-xs text-muted">
        {t.billing.gatewayNote}
      </p>

      {canCancel && (
        <Button variant="ghost" size="sm" loading={busy === "cancel"} onClick={cancel}>
          <CalendarX className="h-4 w-4" />
          {t.billing.cancelAtPeriodEnd}
        </Button>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}
