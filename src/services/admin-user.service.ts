import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { publishUserEvent } from "@/lib/events";
import type { AdminUserUpdateInput } from "@/lib/validation/admin-user";
import { AuditAction, recordAudit } from "./audit.service";
import type { RequestMeta } from "./auth.service";

export type AdminMemberDetail = Awaited<ReturnType<typeof getMemberDetail>>;

export async function getMemberDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      lockedUntil: true,
      failedLoginAttempts: true,
      providerProfile: { select: { id: true, displayName: true, status: true } },
      _count: { select: { tradingAccounts: true, subscriptions: true, sessions: true } },
    },
  });

  if (!user) throw new AppError(ErrorCode.NOT_FOUND, "Member not found");
  return user;
}

/**
 * Updates a member's name, role and status.
 *
 * Two guardrails exist so an administrator cannot lock the platform out of
 * itself: nobody may change their own role or status, and the last remaining
 * active administrator cannot be demoted or suspended.
 */
export async function updateMember(
  userId: string,
  input: AdminUserUpdateInput,
  actor: { id: string },
  meta: RequestMeta,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(ErrorCode.NOT_FOUND, "Member not found");

  const changingRole = input.role !== user.role;
  const changingStatus = input.status !== user.status;

  if (userId === actor.id && (changingRole || changingStatus)) {
    throw new AppError(
      ErrorCode.FORBIDDEN,
      "You cannot change your own role or status. Ask another administrator.",
    );
  }

  if (user.role === "ADMIN" && (input.role !== "ADMIN" || input.status !== "ACTIVE")) {
    await assertNotLastAdmin(userId);
  }

  const suspending = input.status !== "ACTIVE" && user.status === "ACTIVE";

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name === "" ? null : (input.name ?? user.name),
      role: input.role,
      status: input.status,
      ...(input.unlock ? { lockedUntil: null, failedLoginAttempts: 0 } : {}),
    },
    select: { id: true, email: true, name: true, role: true, status: true },
  });

  // A suspended member must stop trading immediately, not at their next login:
  // their sessions are revoked and every subscription is paused.
  if (suspending) {
    await suspendMemberActivity(userId);
  }

  // A role change takes effect on the next request either way; revoking makes
  // that immediate rather than leaving a stale session with old privileges.
  if (changingRole) {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await recordAudit({
    action: AuditAction.ADMIN_ACTION,
    userId: actor.id,
    resourceType: "User",
    resourceId: userId,
    metadata: {
      action: "MEMBER_UPDATED",
      targetEmail: user.email,
      role: { from: user.role, to: input.role },
      status: { from: user.status, to: input.status },
      unlocked: input.unlock,
    },
    ...meta,
  });

  logEvent({ event: "ADMIN_MEMBER_UPDATED", targetId: userId, actorId: actor.id, role: input.role, status: input.status });

  return updated;
}

export type DeletionBlocker = { code: string; message: string };

/**
 * What stands in the way of deleting a member. Deleting removes their stored
 * credentials, so anything still running at a broker would be left with no way
 * to reach it — the admin has to stop that first.
 */
export async function getDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const [user, copying, connected] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
    prisma.strategySubscription.count({ where: { userId, copyStatus: "COPYING" } }),
    prisma.tradingAccount.count({ where: { userId, connectionStatus: "CONNECTED" } }),
  ]);

  if (!user) throw new AppError(ErrorCode.NOT_FOUND, "Member not found");

  const blockers: DeletionBlocker[] = [];

  if (copying > 0) {
    blockers.push({
      code: "STILL_COPYING",
      message: `${copying} subscription(s) are still copying. Stop them before deleting.`,
    });
  }

  if (connected > 0) {
    blockers.push({
      code: "ACCOUNT_CONNECTED",
      message: `${connected} trading account(s) are still connected. Disconnect them before deleting.`,
    });
  }

  if (user.role === "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", status: "ACTIVE", id: { not: userId } },
    });
    if (otherAdmins === 0) {
      blockers.push({ code: "LAST_ADMIN", message: "This is the last active administrator." });
    }
  }

  return blockers;
}

/**
 * Permanently deletes a member. Cascades remove their accounts, subscriptions,
 * copy history and provider profile.
 *
 * Note for the caller: positions already open at a broker are **not** closed by
 * this. They stay open under the member's own control — the platform simply
 * loses its ability to act on them.
 */
export async function deleteMember(
  userId: string,
  confirmEmail: string,
  actor: { id: string },
  meta: RequestMeta,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new AppError(ErrorCode.NOT_FOUND, "Member not found");

  if (userId === actor.id) {
    throw new AppError(ErrorCode.FORBIDDEN, "You cannot delete your own account");
  }

  if (confirmEmail !== user.email.toLowerCase()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "The confirmation email does not match this member");
  }

  const blockers = await getDeletionBlockers(userId);
  if (blockers.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, blockers.map((blocker) => blocker.message).join(" "), {
      details: blockers,
    });
  }

  // Written before the delete: the audit row must survive the member it
  // describes, and the user id is set null by the cascade.
  await recordAudit({
    action: AuditAction.ADMIN_ACTION,
    userId: actor.id,
    resourceType: "User",
    resourceId: userId,
    metadata: { action: "MEMBER_DELETED", targetEmail: user.email, targetRole: user.role },
    ...meta,
  });

  await prisma.user.delete({ where: { id: userId } });

  logEvent({ event: "ADMIN_MEMBER_DELETED", targetId: userId, actorId: actor.id });
}

// ---------------------------------------------------------------------------

async function assertNotLastAdmin(userId: string) {
  const otherAdmins = await prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE", id: { not: userId } },
  });

  if (otherAdmins === 0) {
    throw new AppError(
      ErrorCode.CONFLICT,
      "This is the last active administrator. Promote another account first.",
    );
  }
}

/** Stops a suspended member trading right away rather than at next login. */
async function suspendMemberActivity(userId: string) {
  const [, paused] = await prisma.$transaction([
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.strategySubscription.updateMany({
      where: { userId, copyStatus: "COPYING" },
      data: { copyStatus: "PAUSED", pausedAt: new Date() },
    }),
    prisma.tradingAccount.updateMany({
      where: { userId, copyStatus: "COPYING" },
      data: { copyStatus: "IDLE" },
    }),
  ]);

  if (paused.count > 0) {
    await publishUserEvent(userId, {
      type: "COPY_STATUS",
      subscriptionId: "all",
      status: "PAUSED",
      at: new Date().toISOString(),
    });
  }
}
