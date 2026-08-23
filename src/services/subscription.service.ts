import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import { getPaymentProvider } from "@/providers/payment/factory";
import { AuditAction, recordAudit } from "./audit.service";
import type { RequestMeta } from "./auth.service";

export type PlanView = {
  id: string;
  tier: string;
  name: string;
  priceMonthly: number;
  currency: string;
  maxAccounts: number;
  maxStrategies: number;
  features: string[];
  current: boolean;
};

export async function listPlans(userId: string): Promise<PlanView[]> {
  const [plans, current] = await Promise.all([
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } }),
    prisma.subscription.findUnique({ where: { userId } }),
  ]);

  return plans.map((plan) => ({
    id: plan.id,
    tier: plan.tier,
    name: plan.name,
    priceMonthly: Number(plan.priceMonthly),
    currency: plan.currency,
    maxAccounts: plan.maxAccounts,
    maxStrategies: plan.maxStrategies,
    features: plan.features,
    current: current?.planId === plan.id,
  }));
}

export async function getCurrentSubscription(userId: string) {
  return prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
}

/**
 * The plan a member is entitled to. Everyone has one: without a paid
 * subscription the free tier applies, so limit checks never have to special-case
 * "no subscription".
 */
export async function getEffectivePlan(userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  if (subscription && subscription.status === "ACTIVE") {
    const expired = subscription.currentPeriodEnd && subscription.currentPeriodEnd < new Date();
    if (!expired) return subscription.plan;
  }

  const free = await prisma.subscriptionPlan.findUnique({ where: { tier: "FREE" } });
  if (!free) throw new AppError(ErrorCode.INTERNAL_ERROR, "No FREE plan is configured");
  return free;
}

/** Enforced before a member adds an account or subscribes to a strategy. */
export async function assertWithinPlanLimits(
  userId: string,
  resource: "ACCOUNT" | "STRATEGY",
): Promise<void> {
  const plan = await getEffectivePlan(userId);

  if (resource === "ACCOUNT") {
    const used = await prisma.tradingAccount.count({ where: { userId } });
    if (used >= plan.maxAccounts) {
      throw new AppError(
        ErrorCode.PLAN_LIMIT_REACHED,
        `The ${plan.name} plan allows ${plan.maxAccounts} trading account(s)`,
      );
    }
    return;
  }

  const used = await prisma.strategySubscription.count({ where: { userId, status: "ACTIVE" } });
  if (used >= plan.maxStrategies) {
    throw new AppError(
      ErrorCode.PLAN_LIMIT_REACHED,
      `The ${plan.name} plan allows ${plan.maxStrategies} strategy subscription(s)`,
    );
  }
}

/**
 * Starts a plan change. Money and entitlement are separated: the subscription is
 * only moved once the provider reports the payment as PAID, so a pending or
 * failed payment never grants access.
 */
export async function changePlan(userId: string, planId: string, meta: RequestMeta) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new AppError(ErrorCode.NOT_FOUND, "Plan not found");

  const amount = Number(plan.priceMonthly);
  const provider = getPaymentProvider();

  const checkout = await provider.createCheckout({
    userId,
    planId: plan.id,
    planName: plan.name,
    amount,
    currency: plan.currency,
    returnUrl: "/billing",
  });

  const transaction = await prisma.paymentTransaction.create({
    data: {
      userId,
      planId: plan.id,
      provider: provider.name,
      providerRef: checkout.reference,
      amount,
      currency: plan.currency,
      status: checkout.status === "PAID" ? "PAID" : "PENDING",
      paidAt: checkout.status === "PAID" ? new Date() : null,
    },
  });

  if (checkout.status !== "PAID") {
    return { status: "PENDING" as const, redirectUrl: checkout.redirectUrl, transactionId: transaction.id };
  }

  await applyPaidPlan(userId, plan.id);
  await recordAudit({
    action: AuditAction.PLAN_CHANGED,
    userId,
    resourceType: "Subscription",
    resourceId: transaction.id,
    metadata: { tier: plan.tier, amount },
    ...meta,
  });

  return { status: "PAID" as const, redirectUrl: null, transactionId: transaction.id };
}

/** Moves the member onto the plan for one period. */
async function applyPaidPlan(userId: string, planId: string) {
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      planId,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
    create: {
      userId,
      planId,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });
}

/** Cancels at the end of the paid period rather than removing access at once. */
export async function cancelPlan(userId: string, meta: RequestMeta) {
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  if (!subscription) throw new AppError(ErrorCode.NOT_FOUND, "No subscription to cancel");

  const updated = await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true },
  });

  await recordAudit({
    action: AuditAction.PLAN_CANCELLED,
    userId,
    resourceType: "Subscription",
    resourceId: subscription.id,
    ...meta,
  });

  return updated;
}

export const listPayments = (userId: string) =>
  prisma.paymentTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { plan: { select: { name: true, tier: true } } },
  });
