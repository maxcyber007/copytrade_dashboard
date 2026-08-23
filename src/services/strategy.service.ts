import { strategyRepository } from "@/repositories/strategy.repository";
import { subscriptionRepository } from "@/repositories/subscription.repository";
import { AppError, ErrorCode } from "@/lib/errors";
import { randomToken, sha256, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { StrategyInput, StrategyStatusInput } from "@/lib/validation/strategy";
import { AuditAction, recordAudit } from "./audit.service";
import { requireApprovedProvider } from "./provider.service";
import type { RequestMeta } from "./auth.service";

export const listPublicStrategies = () => strategyRepository.listPublic();
export const listAllStrategies = () => strategyRepository.listAll();

export async function getPublicStrategy(id: string) {
  const strategy = await strategyRepository.findPublic(id);
  if (!strategy) throw new AppError(ErrorCode.NOT_FOUND, "Strategy not found");
  return strategy;
}

/** Admin creates a platform-owned strategy. */
export async function createPlatformStrategy(adminId: string, input: StrategyInput, meta: RequestMeta) {
  await assertCodeAvailable(input.code);

  const strategy = await strategyRepository.create({
    ...toStrategyData(input),
    ownerType: "PLATFORM",
  });

  await recordAudit({
    action: AuditAction.ADMIN_ACTION,
    userId: adminId,
    resourceType: "Strategy",
    resourceId: strategy.id,
    metadata: { action: "STRATEGY_CREATED", code: strategy.code },
    ...meta,
  });

  return strategy;
}

/** An approved provider creates a strategy of their own. */
export async function createProviderStrategy(userId: string, input: StrategyInput, meta: RequestMeta) {
  const provider = await requireApprovedProvider(userId);
  await assertCodeAvailable(input.code);

  const strategy = await strategyRepository.create({
    ...toStrategyData(input),
    ownerType: "PROVIDER",
    providerId: provider.id,
    // A provider strategy starts as a draft: an admin decides when it goes live.
    status: "DRAFT",
  });

  await prisma.providerProfile.update({
    where: { id: provider.id },
    data: { totalStrategies: { increment: 1 } },
  });

  await recordAudit({
    action: AuditAction.STRATEGY_CREATED,
    userId,
    resourceType: "Strategy",
    resourceId: strategy.id,
    metadata: { code: strategy.code },
    ...meta,
  });

  return strategy;
}

export async function listProviderStrategies(userId: string) {
  const provider = await requireApprovedProvider(userId);
  return strategyRepository.listForProvider(provider.id);
}

export async function updateStrategy(
  id: string,
  input: StrategyInput,
  actor: { userId: string; isAdmin: boolean },
  meta: RequestMeta,
) {
  const strategy = await requireStrategyAccess(id, actor);
  if (strategy.code !== input.code) await assertCodeAvailable(input.code);

  const updated = await strategyRepository.update(id, toStrategyData(input));

  await recordAudit({
    action: actor.isAdmin ? AuditAction.ADMIN_ACTION : AuditAction.STRATEGY_UPDATED,
    userId: actor.userId,
    resourceType: "Strategy",
    resourceId: id,
    metadata: { action: "STRATEGY_UPDATED" },
    ...meta,
  });

  return updated;
}

/**
 * Changing status is the control that stops trades reaching members.
 * Pausing offers the operator a choice: keep member positions, or close them.
 */
export async function setStrategyStatus(
  id: string,
  input: StrategyStatusInput,
  actor: { userId: string; isAdmin: boolean },
  meta: RequestMeta,
) {
  const strategy = await requireStrategyAccess(id, actor);
  // Only an admin can put a strategy live; a provider can pause or stop theirs.
  if (!actor.isAdmin && input.status === "ACTIVE" && strategy.status === "DRAFT") {
    throw new AppError(ErrorCode.FORBIDDEN, "An administrator must approve a strategy before it goes live");
  }

  const updated = await strategyRepository.update(id, { status: input.status });

  if (input.status !== "ACTIVE") {
    // Members stop receiving new trades immediately; existing positions are
    // only touched when the operator explicitly asks for it.
    const affected = await prisma.strategySubscription.findMany({
      where: { strategyId: id, copyStatus: "COPYING" },
      select: { accountId: true },
    });

    await prisma.strategySubscription.updateMany({
      where: { strategyId: id, copyStatus: "COPYING" },
      data: { copyStatus: "PAUSED", pausedAt: new Date() },
    });

    // An account is only COPYING while one of its subscriptions still is —
    // otherwise the dashboard would keep showing a paused account as copying.
    for (const accountId of new Set(affected.map((row) => row.accountId))) {
      const stillCopying = await prisma.strategySubscription.count({
        where: { accountId, copyStatus: "COPYING" },
      });
      if (stillCopying === 0) {
        await prisma.tradingAccount.update({ where: { id: accountId }, data: { copyStatus: "IDLE" } });
      }
    }
  }

  await recordAudit({
    action: actor.isAdmin ? AuditAction.ADMIN_ACTION : AuditAction.STRATEGY_UPDATED,
    userId: actor.userId,
    resourceType: "Strategy",
    resourceId: id,
    metadata: {
      action: "STRATEGY_STATUS_CHANGED",
      status: input.status,
      closeExistingPositions: input.closeExistingPositions,
    },
    ...meta,
  });

  return updated;
}

export async function deleteStrategy(id: string, actor: { userId: string; isAdmin: boolean }, meta: RequestMeta) {
  await requireStrategyAccess(id, actor);

  const activeSubscribers = await subscriptionRepository.countActiveForStrategy(id);
  if (activeSubscribers > 0) {
    throw new AppError(ErrorCode.CONFLICT, `${activeSubscribers} member(s) still subscribe to this strategy`);
  }

  await strategyRepository.delete(id);
  await recordAudit({
    action: actor.isAdmin ? AuditAction.ADMIN_ACTION : AuditAction.STRATEGY_UPDATED,
    userId: actor.userId,
    resourceType: "Strategy",
    resourceId: id,
    metadata: { action: "STRATEGY_DELETED" },
    ...meta,
  });
}

/**
 * Issues master EA credentials for one strategy. The secret is returned exactly
 * once: it is stored encrypted (not hashed) because verifying an HMAC has to
 * read it back, and it is never retrievable through any later request.
 */
export async function issueStrategyApiKey(
  strategyId: string,
  actor: { userId: string; isAdmin: boolean },
  label: string,
  meta: RequestMeta,
) {
  await requireStrategyAccess(strategyId, actor);

  const keyId = `ct_${randomToken(12)}`;
  const secret = randomToken(32);

  const created = await prisma.strategyApiKey.create({
    data: { strategyId, label, keyId, encryptedSecret: encryptSecret(secret) },
    select: { id: true, keyId: true, label: true, createdAt: true },
  });

  await recordAudit({
    action: AuditAction.PROVIDER_KEY_ISSUED,
    userId: actor.userId,
    resourceType: "StrategyApiKey",
    resourceId: created.id,
    metadata: { strategyId, keyId, fingerprint: sha256(secret).slice(0, 12) },
    ...meta,
  });

  return { ...created, secret };
}

export async function revokeStrategyApiKey(
  keyId: string,
  actor: { userId: string; isAdmin: boolean },
  meta: RequestMeta,
) {
  const key = await prisma.strategyApiKey.findUnique({ where: { id: keyId } });
  if (!key) throw new AppError(ErrorCode.NOT_FOUND, "API key not found");
  await requireStrategyAccess(key.strategyId, actor);

  await prisma.strategyApiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
  await recordAudit({
    action: AuditAction.PROVIDER_KEY_REVOKED,
    userId: actor.userId,
    resourceType: "StrategyApiKey",
    resourceId: keyId,
    ...meta,
  });
}

// -- helpers -----------------------------------------------------------------

function toStrategyData(input: StrategyInput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description || null,
    masterPlatform: input.masterPlatform,
    masterAccountCode: input.masterAccountCode || null,
    minPlanTier: input.minPlanTier,
    isPublic: input.isPublic,
  };
}

async function assertCodeAvailable(code: string) {
  if (await strategyRepository.findByCode(code)) {
    throw new AppError(ErrorCode.CONFLICT, `Strategy code ${code} is already in use`);
  }
}

/** An admin reaches any strategy; a provider only their own. */
async function requireStrategyAccess(id: string, actor: { userId: string; isAdmin: boolean }) {
  const strategy = await strategyRepository.findById(id);
  if (!strategy) throw new AppError(ErrorCode.NOT_FOUND, "Strategy not found");
  if (actor.isAdmin) return strategy;

  const provider = await requireApprovedProvider(actor.userId);
  if (strategy.providerId !== provider.id) {
    throw new AppError(ErrorCode.FORBIDDEN, "This strategy belongs to another provider");
  }
  return strategy;
}
