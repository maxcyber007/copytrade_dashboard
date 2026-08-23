import { prisma } from "@/lib/prisma";
import { subscriptionRepository } from "@/repositories/subscription.repository";
import { accountRepository } from "@/repositories/account.repository";
import { strategyRepository } from "@/repositories/strategy.repository";
import { AppError, ErrorCode } from "@/lib/errors";
import type { SubscribeInput } from "@/lib/validation/copy";
import { copySettingsSchema, riskProfileSchema } from "@/lib/validation/copy";
import { AuditAction, recordAudit } from "./audit.service";
import type { RequestMeta } from "./auth.service";

export const listSubscriptions = (userId: string) => subscriptionRepository.listForUser(userId);

/**
 * Subscribes one trading account to one strategy. Copy settings and risk limits
 * belong to the member, not the provider — defaults are applied when the member
 * does not send their own.
 */
export async function subscribe(userId: string, input: SubscribeInput, meta: RequestMeta) {
  const account = await accountRepository.findOwned(input.accountId, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");

  const strategy = await strategyRepository.findPublic(input.strategyId);
  if (!strategy) throw new AppError(ErrorCode.NOT_FOUND, "Strategy not found");
  if (strategy.status !== "ACTIVE") {
    throw new AppError(ErrorCode.CONFLICT, "This strategy is not accepting subscribers right now");
  }

  if (await subscriptionRepository.findByAccountAndStrategy(input.accountId, input.strategyId)) {
    throw new AppError(ErrorCode.CONFLICT, "This account already follows that strategy");
  }

  const settings = copySettingsSchema.parse(input.copySettings ?? {});
  const risk = riskProfileSchema.parse(input.riskProfile ?? {});

  const subscription = await prisma.strategySubscription.create({
    data: {
      userId,
      strategyId: input.strategyId,
      accountId: input.accountId,
      status: "ACTIVE",
      copyStatus: "IDLE",
      copySettings: { create: settings },
      riskProfile: { create: risk },
    },
    include: { copySettings: true, riskProfile: true },
  });

  await prisma.strategy.update({
    where: { id: input.strategyId },
    data: { memberCount: { increment: 1 } },
  });

  await recordAudit({
    action: AuditAction.STRATEGY_SUBSCRIBED,
    userId,
    resourceType: "StrategySubscription",
    resourceId: subscription.id,
    metadata: { strategyId: input.strategyId, accountId: input.accountId },
    ...meta,
  });

  return subscription;
}

export async function updateCopySettings(
  subscriptionId: string,
  userId: string,
  input: unknown,
  meta: RequestMeta,
) {
  const subscription = await requireOwnedSubscription(subscriptionId, userId);
  const settings = copySettingsSchema.parse(input);

  const updated = await prisma.copySettings.upsert({
    where: { subscriptionId: subscription.id },
    update: settings,
    create: { subscriptionId: subscription.id, ...settings },
  });

  await recordAudit({
    action: AuditAction.COPY_SETTINGS_UPDATED,
    userId,
    resourceType: "CopySettings",
    resourceId: updated.id,
    ...meta,
  });

  return updated;
}

/**
 * Copy control. Starting requires a connected account and a live strategy —
 * a member cannot start copying into an account we cannot reach.
 */
export async function startCopying(subscriptionId: string, userId: string, meta: RequestMeta) {
  const subscription = await requireOwnedSubscription(subscriptionId, userId);

  const account = await accountRepository.findOwned(subscription.accountId, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");
  if (account.connectionStatus !== "CONNECTED") {
    throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "Connect the trading account before copying");
  }

  const strategy = await strategyRepository.findById(subscription.strategyId);
  if (strategy?.status !== "ACTIVE") {
    throw new AppError(ErrorCode.CONFLICT, "This strategy is not active");
  }

  const updated = await subscriptionRepository.update(subscriptionId, {
    copyStatus: "COPYING",
    status: "ACTIVE",
    startedAt: new Date(),
    pausedAt: null,
    stoppedAt: null,
  });

  await accountRepository.update(subscription.accountId, { copyStatus: "COPYING" });
  await recordAudit({
    action: AuditAction.COPY_STARTED,
    userId,
    resourceType: "StrategySubscription",
    resourceId: subscriptionId,
    ...meta,
  });

  return updated;
}

export async function pauseCopying(subscriptionId: string, userId: string, meta: RequestMeta) {
  await requireOwnedSubscription(subscriptionId, userId);

  const updated = await subscriptionRepository.update(subscriptionId, {
    copyStatus: "PAUSED",
    pausedAt: new Date(),
  });

  await syncAccountCopyStatus(updated.accountId, userId);
  await recordAudit({
    action: AuditAction.COPY_PAUSED,
    userId,
    resourceType: "StrategySubscription",
    resourceId: subscriptionId,
    ...meta,
  });

  return updated;
}

export async function stopCopying(subscriptionId: string, userId: string, meta: RequestMeta) {
  await requireOwnedSubscription(subscriptionId, userId);

  const updated = await subscriptionRepository.update(subscriptionId, {
    copyStatus: "STOPPED",
    stoppedAt: new Date(),
  });

  await syncAccountCopyStatus(updated.accountId, userId);
  await recordAudit({
    action: AuditAction.COPY_STOPPED,
    userId,
    resourceType: "StrategySubscription",
    resourceId: subscriptionId,
    ...meta,
  });

  return updated;
}

export async function unsubscribe(subscriptionId: string, userId: string, meta: RequestMeta) {
  const subscription = await requireOwnedSubscription(subscriptionId, userId);
  if (subscription.copyStatus === "COPYING") {
    throw new AppError(ErrorCode.CONFLICT, "Stop copying before unsubscribing");
  }

  await subscriptionRepository.delete(subscriptionId);
  await prisma.strategy.update({
    where: { id: subscription.strategyId },
    data: { memberCount: { decrement: 1 } },
  });

  await syncAccountCopyStatus(subscription.accountId, userId);
  await recordAudit({
    action: AuditAction.COPY_STOPPED,
    userId,
    resourceType: "StrategySubscription",
    resourceId: subscriptionId,
    metadata: { unsubscribed: true },
    ...meta,
  });
}

// -- helpers -----------------------------------------------------------------

async function requireOwnedSubscription(id: string, userId: string) {
  const subscription = await prisma.strategySubscription.findFirst({ where: { id, userId } });
  if (!subscription) throw new AppError(ErrorCode.NOT_FOUND, "Subscription not found");
  return subscription;
}

/** An account is COPYING while any of its subscriptions still is. */
async function syncAccountCopyStatus(accountId: string, userId: string) {
  const stillCopying = await prisma.strategySubscription.count({
    where: { accountId, userId, copyStatus: "COPYING" },
  });
  await accountRepository.update(accountId, { copyStatus: stillCopying > 0 ? "COPYING" : "IDLE" });
}
